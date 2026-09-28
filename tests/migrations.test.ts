import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";

test("migrations build an empty database, persist the complete trade schema and rerun safely", async () => {
  const client = new PGlite();
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [user] = await db.insert(users).values({ email: "migration@example.test" }).returning();
    const [account] = await db.insert(tradingAccounts).values({ userId: user.id, name: "Test", balance: "0" }).returning();
    const [trade] = await db.insert(trades).values({ accountId: account.id, symbol: "EURUSD", direction: "LONG", entryPrice: "1.1", quantity: "1", entryTime: new Date("2026-09-21T12:00:00Z"), setup: "Retest", rationale: "Support held", notes: "Open trade" }).returning();
    assert.equal(trade.rationale, "Support held");
    assert.equal(trade.exitTime, null);
    assert.equal(trade.pnl, null);
    await migrate(db, { migrationsFolder: "./drizzle" });
    assert.equal((await db.select().from(trades)).length, 1);
    const history = await client.query("SELECT * FROM drizzle.__drizzle_migrations");
    assert.equal(history.rows.length, 2);
    await assert.rejects(db.insert(trades).values({ accountId: "00000000-0000-4000-8000-000000000000", symbol: "EURUSD", direction: "LONG", entryPrice: "1", quantity: "1", entryTime: new Date() }));
  } finally {
    await client.close();
  }
});
