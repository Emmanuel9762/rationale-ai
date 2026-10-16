import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inspectPaperCsv, mapPaperCsv, type PaperMapping } from "../src/lib/paper-csv";
import { CSV_MAX_BYTES, previewTradeCsv } from "../src/lib/trade-csv-preview";

const sample = readFileSync("public/samples/paper-trades-mapping.csv","utf8");
const mapping: PaperMapping = {symbol:0,direction:1,entry_price:2,quantity:3,entry_time_utc:4,exit_price:5,exit_time_utc:6,recorded_pnl:7,setup:8,notes:9};
test("paper sample maps exact decimals, entry sides and multiline text into the existing import contract",()=>{
  const result=mapPaperCsv(sample,mapping,"buy-sell",true);
  assert.equal(result.preview.total,3);
  assert.equal(result.preview.errors.length,0);
  assert.deepEqual(result.preview.rows.map(row=>[row.trade.direction,row.trade.pnl]),[["LONG","2.00"],["SHORT","-2.00"],["LONG",null]]);
  assert.equal(result.preview.rows[1].trade.notes,"Synthetic loss\nReview the entry");
  assert.equal(result.preview.rows[0].trade.quantity,"1000");
  assert.deepEqual(result.ignoredHeaders,["External reference"]);
  assert.equal(previewTradeCsv(result.csv).rows.length,3);
  assert.ok(!result.csv.includes("DEMO-001"));
});
test("mapping requires deliberate field choices, unique source columns and whole-trade acknowledgement",()=>{
  assert.throws(()=>mapPaperCsv(sample,mapping,"buy-sell",false),/Confirm/);
  assert.throws(()=>mapPaperCsv(sample,{},"buy-sell",true),/required/);
  assert.throws(()=>mapPaperCsv(sample,{...mapping,quantity:2},"buy-sell",true),/only once/);
  for(const index of [-1,1.5,99]) assert.throws(()=>mapPaperCsv(sample,{...mapping,symbol:index},"buy-sell",true),/existing source column/);
  assert.throws(()=>mapPaperCsv(sample,{...mapping,account_id:10} as PaperMapping,"buy-sell",true),/existing source column/);
});
test("invalid dates, amounts, side encodings and incomplete closing fields block a clean download",()=>{
  for(const source of [
    sample.replace("2026-10-01T09:30:00Z","2026-10-01 09:30"),
    sample.replace("2026-10-01T09:30:00Z","2026-10-01T09:30:00+02:00"),
    sample.replace("1.100000","R1.10"),
    sample.replace("2.00,Pullback","2.001,Pullback"),
    sample.replace("BUY","BUY LIMIT"),
    sample.replace("1.102000,2026-10-01T10:00:00Z",",2026-10-01T10:00:00Z"),
  ]) assert.ok(mapPaperCsv(source,mapping,"buy-sell",true).preview.errors.length>0);
  assert.ok(mapPaperCsv(sample,mapping,"long-short",true).preview.errors.length>0);
  assert.ok(mapPaperCsv(sample.replaceAll("BUY","LONG").replaceAll("SELL","SHORT"),mapping,"buy-sell",true).preview.errors.length>0);
});
test("malformed source structures and bounded input are rejected before normalisation",()=>{
  for(const source of ["","a,b","a,a\n1,2","a,\n1,2",'a,b\n"unterminated',sample.replace("EURUSD,BUY","EURUSD,EXTRA,BUY"),"x".repeat(CSV_MAX_BYTES+1),sample+"\u0000"]) {
    assert.throws(()=>mapPaperCsv(source,mapping,"buy-sell",true));
  }
  assert.throws(()=>inspectPaperCsv(Array.from({length:33},(_,i)=>"c"+i).join(",")+"\n"+Array(33).fill("a").join(",")),/columns/);
  assert.throws(()=>inspectPaperCsv("a\n"+"b\n".repeat(501)),/500/);
});
test("formula-like mapped text is visibly protected and numeric negatives remain exact",()=>{
  const result=mapPaperCsv(sample.replace("Pullback","=1+1").replace("Synthetic open trade","@command"),mapping,"buy-sell",true);
  assert.equal(result.preview.rows[0].trade.setup,"'=1+1");
  assert.equal(result.preview.rows[2].trade.notes,"'@command");
  assert.equal(result.preview.rows[1].trade.pnl,"-2.00");
  assert.deepEqual(previewTradeCsv(result.csv).rows.map(row=>row.trade),result.preview.rows.map(row=>row.trade));
});
test("source record numbers survive blank records and repeated trades remain visible",()=>{
  const source="symbol,direction,entry_price,quantity,entry_time_utc\n\nEURUSD,LONG,1,1,2026-01-01T00:00:00Z\nEURUSD,LONG,1,1,2026-01-01T00:00:00Z\nBAD,LONG,0,1,2026-01-01T00:00:00Z";
  const result=mapPaperCsv(source,{symbol:0,direction:1,entry_price:2,quantity:3,entry_time_utc:4},"long-short",true);
  assert.deepEqual(result.preview.rows.map(row=>[row.record,row.duplicateOf]),[[3,undefined],[4,3]]);
  assert.equal(result.preview.errors[0].record,5);
});
test("the shared reader preserves strict existing Rationale header validation",()=>{
  assert.throws(()=>previewTradeCsv(sample),/Unknown columns/);
  assert.equal(inspectPaperCsv("\uFEFF"+sample).headers[0],"Instrument");
});
