import assert from "node:assert/strict";
import test from "node:test";
import { performanceCsv, PERFORMANCE_EXPORT_LIMIT, PerformanceExportLimitError, type PerformanceExportGroup } from "../src/lib/performance-csv";

const row: PerformanceExportGroup["rows"][number] = {
  group:'=SUM(1,2)\n"label"', total:4,closed:3,open:1,missingPnl:1,measured:2,wins:1,losses:1,breakeven:0,
  pnl:"-100999999999998.99",grossProfit:"0.01",grossLoss:"100999999999999.00",averagePnl:"-50499999999999.50",averageWin:"0.01",averageLoss:"100999999999999.00",winRate:"50.0%",profitFactor:"0.00",
};
test("performance CSV preserves precision, date context and spreadsheet-safe labels", () => {
  const csv=performanceCsv([{by:"setup",rows:[row]}],{from:"2026-01-01",to:"2026-01-31"});
  assert.ok(csv.startsWith('\uFEFF"dimension","group","missing_label"'));
  assert.ok(csv.includes('"setup","\'=SUM(1,2)\n""label""","false","2026-01-01","2026-01-31","4","1","1","2","1","1","0","50.0%","-100999999999998.99"'));
  assert.ok(csv.includes('"-50499999999999.50","0.01","100999999999999.00","0.00"\r\n'));
});
test("performance CSV distinguishes missing labels, absent metrics and measured zero", () => {
  const unmeasured={...row,group:null,closed:0,open:4,missingPnl:0,measured:0,wins:0,losses:0,breakeven:0,pnl:"0",averagePnl:null,averageWin:null,averageLoss:null,winRate:"—",profitFactor:"—"};
  const csv=performanceCsv([{by:"setup",rows:[unmeasured,{...unmeasured,group:"Not specified"},{...unmeasured,group:"Zero",closed:4,open:0,measured:4,breakeven:4,pnl:"0.00",averagePnl:"0.00",winRate:"0.0%"},{...row,group:"Profit only",profitFactor:"∞"}]}],{});
  assert.ok(csv.includes('"setup","","true","","","4","4","0","0","0","0","0","","","","","",""\r\n'));
  assert.ok(csv.includes('"setup","Not specified","false"'));
  assert.ok(csv.includes('"4","0","0","4","0","0","4","0.0%","0.00","0.00","","",""'));
  assert.ok(csv.includes('"∞"\r\n'));
  assert.equal(performanceCsv([],{}).trim().split('\r\n').length,1);
});
test("performance export enforces the combined group cap without partial output", () => {
  const rows=Array.from({length:PERFORMANCE_EXPORT_LIMIT/2},()=>({...row,group:"Group"}));
  assert.equal(performanceCsv([{by:"setup",rows},{by:"symbol",rows}],{}).trim().split('\r\n').length,PERFORMANCE_EXPORT_LIMIT+1);
  assert.throws(()=>performanceCsv([{by:"setup",rows},{by:"symbol",rows},{by:"adherence",rows:[row]}],{}),PerformanceExportLimitError);
});
