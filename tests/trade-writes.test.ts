import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, tradingAccounts } from "../src/db/schema";
import { developmentAccount, updateOwnedTrade } from "../src/lib/trade-writes";
import { DEVELOPMENT_EMAIL, tradeRepository } from "../src/lib/trade-repository";
import { parseTradeInput } from "../src/lib/trade-input";

test("reuse development account, edit and close a persisted trade, enforce write ownership", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const accountId = await developmentAccount(db);
    assert.equal(await developmentAccount(db), accountId);
    assert.equal((await db.select().from(tradingAccounts)).length, 1);
    const form = new FormData();
    for (const [key, value] of Object.entries({ symbol: "EURUSD", direction: "LONG", entryPrice: "1.1", quantity: "1", entryTime: "2026-09-21T12:00", rationale: "Original reason" })) form.set(key, value);
    const input = parseTradeInput(form);
    const [trade] = await db.insert(trades).values({ ...input, accountId }).returning();
    form.set("notes", "Corrected notes");
    assert.equal(await updateOwnedTrade(db, "another@test.local", trade.id, parseTradeInput(form)), null);
    assert.equal(await updateOwnedTrade(db, DEVELOPMENT_EMAIL, "bad-id", input), null);
    assert.equal(await updateOwnedTrade(db, DEVELOPMENT_EMAIL, trade.id, parseTradeInput(form)), trade.id);
    form.set("exitPrice", "1.2"); form.set("exitTime", "2026-09-21T13:00"); form.set("pnl", "25.50");
    assert.equal(await updateOwnedTrade(db, DEVELOPMENT_EMAIL, trade.id, parseTradeInput(form)), trade.id);
    const saved = await tradeRepository(db).find(DEVELOPMENT_EMAIL, trade.id);
    assert.equal(saved?.pnl, "25.50"); assert.equal(saved?.notes, "Corrected notes");
    assert.equal(saved?.rationale, "Original reason");
    assert.equal(saved?.exitTime?.toISOString(), "2026-09-21T13:00:00.000Z");
    assert.equal((await db.select().from(trades)).length, 1);
  } finally { await client.close(); }
});
