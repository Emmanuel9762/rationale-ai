import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { tradeRepository } from "../src/lib/trade-repository";

test("journal reads persisted trades in order and excludes another owner's records", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const repo = tradeRepository(db);
    assert.deepEqual(await repo.list("one@test.local"), { trades: [], hasNext: false });
    const ids: string[] = [];
    for (const email of ["one@test.local", "two@test.local"]) {
      const [user] = await db.insert(users).values({ email }).returning();
      const [account] = await db.insert(tradingAccounts).values({ userId: user.id, name: "Test", balance: "0" }).returning();
      const [trade] = await db.insert(trades).values({ accountId: account.id, symbol: "EURUSD", direction: "LONG", entryPrice: "1.1", quantity: "1", entryTime: new Date(), rationale: email }).returning();
      ids.push(trade.id);
    }
    assert.equal((await repo.list("one@test.local")).trades.length, 1);
    assert.equal((await repo.find("one@test.local", ids[0]))?.rationale, "one@test.local");
    assert.equal(await repo.find("one@test.local", ids[1]), null);
    const original = await repo.find("one@test.local", ids[0]);
    await db.insert(trades).values(Array.from({ length: 26 }, (_, i) => ({ accountId: original!.accountId, symbol: `TEST${i}`, direction: "LONG", entryPrice: "1", quantity: "1", entryTime: new Date(Date.UTC(2020, 0, i + 1)) })));
    const first = await repo.list("one@test.local");
    const second = await repo.list("one@test.local", 2);
    assert.equal(first.trades[0].id, ids[0]);
    assert.equal(first.trades.length, 25);
    assert.equal(first.hasNext, true);
    assert.equal(second.trades.length, 2);
    assert.equal(second.hasNext, false);
    assert.equal(new Set([...first.trades, ...second.trades].map(t => t.id)).size, 27);
    assert.equal(await repo.find("one@test.local", "invalid"), null);
    assert.equal(await repo.find("one@test.local", "00000000-0000-4000-8000-000000000000"), null);
  } finally { await client.close(); }
});
