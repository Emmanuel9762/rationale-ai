import assert from "node:assert/strict";
import test from "node:test";
import { entryDatePresets } from "../src/lib/entry-date-presets";
import { parseJournalFilters } from "../src/lib/journal-filters";

test("quick dates use UTC today, inclusive rolling windows and preserve the input", () => {
  const now = new Date("2026-01-01T23:30:00-05:00");
  const original = now.getTime();
  const presets = entryDatePresets(now);
  assert.deepEqual(presets, [
    {label:"Last 7 days",from:"2025-12-27",to:"2026-01-02"},
    {label:"Last 30 days",from:"2025-12-04",to:"2026-01-02"},
    {label:"This month",from:"2026-01-01",to:"2026-01-02"},
    {label:"Last month",from:"2025-12-01",to:"2025-12-31"},
  ]);
  assert.equal(now.getTime(), original);
  for (const {from,to} of presets) assert.deepEqual(parseJournalFilters({from,to}).errors, []);
});
test("quick dates handle leap February and a one-day current month", () => {
  const presets = entryDatePresets(new Date("2024-03-01T00:00:00Z"));
  assert.deepEqual(presets.map(({from,to})=>[from,to]), [
    ["2024-02-24","2024-03-01"],["2024-02-01","2024-03-01"],
    ["2024-03-01","2024-03-01"],["2024-02-01","2024-02-29"],
  ]);
  assert.equal(entryDatePresets(new Date("2023-03-31T23:59:59Z"))[3].to,"2023-02-28");
});
