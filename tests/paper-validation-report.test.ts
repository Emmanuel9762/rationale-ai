import assert from "node:assert/strict";
import test from "node:test";
import { mapPaperCsv } from "../src/lib/paper-csv";
import { paperValidationReport } from "../src/lib/paper-validation-report";
import { readCsvRecords, previewTradeCsv } from "../src/lib/trade-csv-preview";

test("validation report orders invalid and repeated records by original source position", () => {
  const source = "symbol,direction,entry_price,quantity,entry_time_utc,notes\n\nEURUSD,LONG,1,1,2026-01-01T00:00:00Z,Private note\nBAD,LONG,0,1,2026-01-01T00:00:00Z,Secret\nEURUSD,LONG,1,1,2026-01-01T00:00:00Z,Private note";
  const result = mapPaperCsv(source, {symbol:0,direction:1,entry_price:2,quantity:3,entry_time_utc:4,notes:5}, "long-short", true);
  const csv = paperValidationReport(result.preview);
  const records = readCsvRecords(csv);
  assert.deepEqual(records.slice(1).map(row => row.cells.slice(0,3)), [["3","valid",""],["4","invalid",""],["5","repeated","3"]]);
  assert.ok(records[2].cells[3].length > 0);
  assert.ok(!csv.includes("Private note"));
  assert.ok(!csv.includes("EURUSD"));
  assert.throws(() => previewTradeCsv(csv), /Unknown columns/);
  assert.equal(result.preview.rows.length,2); // reporting never removes repeated rows
});

test("report quotes multiline diagnostics and protects spreadsheet formulas", () => {
  const preview = {total:2,ignoredColumns:[],rows:[],errors:[{record:2,message:'=SUM(1,2)\nDiagnostic "quoted"'},{record:3,message:"@unsafe"}]};
  const records = readCsvRecords(paperValidationReport(preview));
  assert.equal(records[1].cells[3], '\'=SUM(1,2)\nDiagnostic "quoted"');
  assert.equal(records[2].cells[3], "'@unsafe");
});
