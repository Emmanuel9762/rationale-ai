import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { tradeMetrics, formatPnl } from "../src/lib/trade-metrics";

test("dashboard aggregates persisted results with ownership and lifecycle exclusions", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const empty = await tradeMetrics(db, "00000000-0000-4000-8000-000000000000");
    assert.equal(empty.total, 0); assert.equal(empty.winRate, "—"); assert.equal(empty.profitFactor, "—");
    const [user] = await db.insert(users).values({ email: "one@test.local" }).returning();
    const [account] = await db.insert(tradingAccounts).values({ userId: user.id, name: "Test", balance: "0" }).returning();
    const base = { accountId: account.id, symbol: "EURUSD", direction: "LONG", entryPrice: "1", quantity: "1", entryTime: new Date("2026-09-21T12:00Z") };
    const close = { exitPrice: "2", exitTime: new Date("2026-09-21T13:00Z") };
    await db.insert(trades).values({ ...base, ...close, pnl: "100.10" });
    const winOnly = await tradeMetrics(db, user.id);
    assert.equal(winOnly.profitFactor, "∞"); assert.equal(winOnly.winRate, "100.0%");
    await db.insert(trades).values([
      { ...base, ...close, pnl: "50.20" }, { ...base, ...close, pnl: "-50.10" },
      { ...base, ...close, pnl: "0" }, { ...base, ...close },
      { ...base }, { ...base, pnl: "999" }, { ...base, exitPrice: "2", pnl: "999" },
    ]);
    const result = await tradeMetrics(db, user.id);
    assert.equal(result.total, 8); assert.equal(result.closed, 5); assert.equal(result.open, 3);
    assert.equal(result.measured, 4); assert.equal(result.missingPnl, 1);
    assert.equal(result.pnl, "100.20"); assert.equal(result.winRate, "50.0%"); assert.equal(result.profitFactor, "3.00");
    assert.equal((await tradeMetrics(db, "00000000-0000-4000-8000-000000000000")).total, 0);
    const [loser] = await db.insert(users).values({ email: "loss@test.local" }).returning();
    const [lossAccount] = await db.insert(tradingAccounts).values({ userId: loser.id, name: "Test", balance: "0" }).returning();
    await db.insert(trades).values({ ...base, ...close, accountId: lossAccount.id, pnl: "-10" });
    assert.equal((await tradeMetrics(db, loser.id)).profitFactor, "0.00");
    assert.equal((await tradeMetrics(db, user.id)).pnl, "100.20");
  } finally { await client.close(); }
});
test("P&L formatting preserves cents above JavaScript's exact integer range", () => {
  assert.equal(formatPnl("12345678901234567890.12"), "12,345,678,901,234,567,890.12");
  assert.equal(formatPnl("-1234.50"), "-1,234.50"); assert.equal(formatPnl("0"), "0.00");
});
