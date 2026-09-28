import assert from "node:assert/strict";
import test from "node:test";
import { parseTradeInput } from "../src/lib/trade-input";
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ symbol: " eurusd ", direction: "LONG", entryPrice: "1.100001", quantity: "1", entryTime: "2026-09-21T12:00", ...overrides })) data.set(key, value);
  return data;
}
test("open and closed trades preserve decimals and use explicit UTC", () => {
  const open = parseTradeInput(form());
  assert.equal(open.symbol, "EURUSD"); assert.equal(open.entryPrice, "1.100001");
  assert.equal(open.entryTime.toISOString(), "2026-09-21T12:00:00.000Z");
  assert.equal(open.exitTime, null); assert.equal(open.pnl, null);
  const closed = parseTradeInput(form({ exitPrice: "1.2", exitTime: "2026-09-21T13:00", pnl: "-12.34" }));
  assert.equal(closed.pnl, "-12.34");
});
const invalidInputs: Record<string, Record<string, string>> = {
  "missing symbol": { symbol: "" }, "invalid direction": { direction: "BUY" },
  "zero price": { entryPrice: "0" }, "negative quantity": { quantity: "-1" },
  "numeric overflow": { entryPrice: "100000000" }, "excess precision": { entryPrice: "1.1234567" },
  "non decimal": { entryPrice: "0x10" }, "NaN": { quantity: "NaN" },
  "invalid date": { entryTime: "2026-02-30T12:00" }, "invalid time": { entryTime: "2026-09-21T25:00" },
  "partial close price": { exitPrice: "1.2" }, "partial close time": { exitTime: "2026-09-21T13:00" },
  "early close": { exitPrice: "1.2", exitTime: "2026-09-20T13:00" },
  "open P&L": { pnl: "10" }, "oversized rationale": { rationale: "x".repeat(2001) },
};
for (const [name, overrides] of Object.entries(invalidInputs)) test(`rejects ${name}`, () => assert.throws(() => parseTradeInput(form(overrides)), Error));
