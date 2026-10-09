import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, previewTradeCsv } from "../src/lib/trade-csv-preview";
import { tradesCsv } from "../src/lib/trade-csv";
import type { trades } from "../src/db/schema";

const header = "symbol,direction,entry_price,quantity,entry_time_utc";
const valid = " eurusd ,LONG,1.123456,2,2026-09-01T12:30:59.123Z";
test("CSV preview handles BOM, quoted commas, escaped quotes, multiline text and blank lines", () => {
  const result = previewTradeCsv('\uFEFF'+header+',notes\r\n'+valid+',"A comma, a ""quote""\nsecond line"\r\n\r\n');
  assert.equal(result.total,1); assert.equal(result.errors.length,0);
  assert.equal(result.rows[0].trade.symbol,"EURUSD");
  assert.equal(result.rows[0].trade.notes,'A comma, a "quote"\nsecond line');
  assert.equal(result.rows[0].trade.entryPrice,"1.123456");
  assert.equal(result.rows[0].trade.entryTime.toISOString(),"2026-09-01T12:30:59.123Z");
  assert.equal(result.rows[0].record,2);
});

test("malformed structure, missing/unknown/repeated headers and binary input reject the whole file", () => {
  for (const text of ["",header,header+"\n"+valid+',"unclosed',header+'\n"oops"text',header+'\nno"quote',"symbol,direction\nA,LONG",header+",accountId\n"+valid+",foreign",header+",symbol\n"+valid+",A",header+"\n"+valid+"\0",header+"\n"+valid+"\ufffd"]) assert.throws(()=>previewTradeCsv(text));
  assert.throws(()=>previewTradeCsv('x'.repeat(CSV_MAX_BYTES+1)),/256 KiB/);
  assert.throws(()=>previewTradeCsv('é'.repeat(CSV_MAX_BYTES/2+1)),/256 KiB/);
  assert.throws(()=>previewTradeCsv(header+'\n'+Array(CSV_MAX_ROWS+1).fill(valid).join('\n')),/500 data/);
  assert.equal(previewTradeCsv(header+'\n'+Array(CSV_MAX_ROWS).fill(valid).join('\n')).total,500);
});

test("value errors identify records without losing valid neighbours", () => {
  const result = previewTradeCsv(header+'\n'+valid+'\n'+valid.replace(',2,',',0,')+'\n'+valid.replace('59.123Z','59+02:00')+'\n'+valid.replace('09-01','02-30')+'\n'+valid+',extra\n'+valid);
  assert.equal(result.rows.length,2);
  assert.deepEqual(result.errors.map(e=>e.record),[3,4,5,6]);
  assert.equal(result.rows[1].duplicateOf,2);
});

test("closure checks preserve sub-minute ordering, P&L precision and zero versus blank", () => {
  const headers=header+',exit_price,exit_time_utc,recorded_pnl';
  const lines=[
    valid+',1.2,2026-09-01T12:30:59.124Z,-12.34',
    valid+',1.2,2026-09-01T12:30:59.122Z,0',
    valid+',1.2,2026-09-01T12:30:59.123Z,0',
    valid+',1.2,2026-09-01T12:31:00Z,',
    valid+',,,1',
    valid+',1.2,,',
    valid+',1.2,2026-09-01T12:31:00Z,1.234',
  ];
  const r=previewTradeCsv(headers+'\n'+lines.join('\n'));
  assert.deepEqual(r.rows.map(row=>row.trade.pnl),['-12.34','0',null]);
  assert.deepEqual(r.errors.map(e=>e.record),[3,6,7,8]);
});

test("review validation matches saved reviews and treats CSV metadata as untrusted context", () => {
  const headers=header+',plan_adherence,review_went_well,review_improve,trade_id,account_id,reviewed_at_utc';
  const lines=['followed,Good,,,foreign,anything','partly,,Improve,,,','not_followed,Good,,,,',',,,,,','followed,,,,,',',Good,,,,','sometimes,Good,,,,'];
  const r=previewTradeCsv(headers+'\n'+lines.map(line=>valid+','+line).join('\n'));
  assert.equal(r.rows.length,4);assert.equal(r.errors.length,3);
  assert.deepEqual(r.ignoredColumns,['trade_id','account_id','reviewed_at_utc']);
  assert.equal(r.rows[0].review?.planAdherence,'followed');
  assert.equal(r.rows[3].review,null);
  assert.ok(!('accountId' in r.rows[0].trade));
});

test("current exports preview safely without undoing spreadsheet protection", () => {
  const row={id:'arbitrary-id',accountId:'other-account',symbol:'TEST',direction:'SHORT',setup:'=SUM(A1)',rationale:'literal, "text"',notes:'line1\nline2',entryPrice:'1.000001',exitPrice:'1.2',quantity:'2',pnl:'-0.01',entryTime:new Date('2026-01-01T00:00:00.001Z'),exitTime:new Date('2026-01-01T00:00:00.002Z'),createdAt:new Date(),planAdherence:'followed',reviewWentWell:'Good',reviewImprove:null,reviewedAt:new Date(),revision:0,submissionKey:null,submissionHash:null} satisfies typeof trades.$inferSelect;
  const r=previewTradeCsv(tradesCsv([row]));
  assert.equal(r.errors.length,0);assert.equal(r.rows[0].trade.setup,"'=SUM(A1)");
  assert.equal(r.rows[0].trade.pnl,'-0.01');
  assert.equal(r.rows[0].trade.notes,'line1\nline2');
  assert.equal(r.ignoredColumns.length,4);
});

test("downloadable mock dataset has the advertised cases and counts", () => {
  const r=previewTradeCsv(readFileSync('public/samples/rationaleai-mock-trades.csv','utf8'));
  assert.equal(r.total,36);assert.equal(r.rows.length,30);assert.equal(r.errors.length,6);
  assert.deepEqual(r.errors.map(e=>e.record),[32,33,34,35,36,37]);
  assert.deepEqual(r.rows.filter(row=>row.duplicateOf).map(row=>[row.record,row.duplicateOf]),[[30,4],[31,2]]);
  assert.equal(r.rows.filter(row=>!row.trade.exitTime).length,5);
  assert.equal(r.rows.filter(row=>row.trade.exitTime&&row.trade.pnl===null).length,4);
  assert.equal(r.rows.filter(row=>row.trade.pnl!==null).length,21);
  assert.ok(r.rows.some(row=>row.trade.notes?.includes('\n')));
});
