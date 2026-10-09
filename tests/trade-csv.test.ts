import assert from "node:assert/strict";
import test from "node:test";
import { tradesCsv } from "../src/lib/trade-csv";
import type { trades } from "../src/db/schema";

test("CSV quotes multiline text, protects formula cells and preserves decimal amounts and UTC", () => {
  const row: typeof trades.$inferSelect = {id:"id",accountId:"account",revision:0,submissionKey:"PRIVATE_KEY",submissionHash:"PRIVATE_HASH",symbol:"=1+1",direction:"LONG",setup:'Comma, "quote"',rationale:"Line one\nLine two",notes:"\t@SUM(1)",planAdherence:"partly",reviewWentWell:"+cmd",reviewImprove:"-cmd",reviewedAt:null,entryPrice:"99999999.123456",exitPrice:null,quantity:"0.000001",pnl:"-999999999999.99",entryTime:new Date("2026-01-01T12:00Z"),exitTime:null,createdAt:new Date("2026-01-01")};
  const csv=tradesCsv([row]);
  assert.ok(csv.startsWith('\uFEFF"trade_id"'));assert.match(csv,/"'=1\+1"/);assert.ok(csv.includes('"Comma, ""quote"""'));assert.ok(csv.includes('"Line one\nLine two"'));
  for(const value of ["\t@SUM(1)","+cmd","-cmd"])assert.ok(csv.includes('"\''+value+'"'));
  assert.ok(csv.includes('"-999999999999.99"'));assert.ok(csv.includes('"99999999.123456"'));assert.ok(csv.includes('"2026-01-01T12:00:00.000Z"'));
  assert.ok(!csv.includes('PRIVATE'));assert.ok(!csv.includes('submission_'));
  assert.equal(tradesCsv([]).split('\r\n').length,2);
});
