import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
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
    assert.deepEqual(await repo.list("00000000-0000-4000-8000-000000000000"), { trades: [], hasNext: false });
    const ownerIds: string[] = [];
    const ids: string[] = [];
    for (const email of ["one@test.local", "two@test.local"]) {
      const [user] = await db.insert(users).values({ email }).returning();
      ownerIds.push(user.id);
      const [account] = await db.insert(tradingAccounts).values({ userId: user.id, name: "Test", balance: "0" }).returning();
      const [trade] = await db.insert(trades).values({ accountId: account.id, symbol: "EURUSD", direction: "LONG", entryPrice: "1.1", quantity: "1", entryTime: new Date(), rationale: email }).returning();
      ids.push(trade.id);
    }
    assert.equal((await repo.list(ownerIds[0])).trades.length, 1);
    assert.equal((await repo.find(ownerIds[0], ids[0]))?.rationale, "one@test.local");
    assert.equal(await repo.find(ownerIds[0], ids[1]), null);
    await db.update(users).set({ email: "changed@test.local" }).where(eq(users.id, ownerIds[0]));
    assert.equal((await repo.list(ownerIds[0])).trades.length, 1);
    assert.equal((await repo.list(ownerIds[1])).trades.length, 1);
    const original = await repo.find(ownerIds[0], ids[0]);
    await db.insert(trades).values(Array.from({ length: 26 }, (_, i) => ({ accountId: original!.accountId, symbol: `TEST${i}`, direction: "LONG", entryPrice: "1", quantity: "1", entryTime: new Date(Date.UTC(2020, 0, i + 1)) })));
    const first = await repo.list(ownerIds[0]);
    const second = await repo.list(ownerIds[0], 2);
    assert.equal(first.trades[0].id, ids[0]);
    assert.equal(first.trades.length, 25);
    assert.equal(first.hasNext, true);
    assert.equal(second.trades.length, 2);
    assert.equal(second.hasNext, false);
    assert.equal(new Set([...first.trades, ...second.trades].map(t => t.id)).size, 27);
    assert.equal(await repo.find(ownerIds[0], "invalid"), null);
    assert.equal(await repo.find(ownerIds[0], "00000000-0000-4000-8000-000000000000"), null);
  } finally { await client.close(); }
});

test("pagination handles an exact full page, overflow, and pages beyond the end", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [user] = await db.insert(users).values({ email: "boundary@test.local" }).returning();
    const [account] = await db.insert(tradingAccounts).values({ userId: user.id, name: "Boundary", balance: "0" }).returning();
    const repo = tradeRepository(db);
    await db.insert(trades).values(Array.from({ length: 25 }, (_, i) => ({
      accountId: account.id, symbol: `BOUND${i}`, direction: "LONG", entryPrice: "1", quantity: "1",
      entryTime: new Date(Date.UTC(2026, 0, i + 1)),
    })));
    const full = await repo.list(user.id);
    assert.equal(full.trades.length, 25);
    assert.equal(full.hasNext, false, "a full page alone must not imply another page");
    assert.deepEqual(await repo.list(user.id, 2), { trades: [], hasNext: false });
    const [oldest] = await db.insert(trades).values({ accountId: account.id, symbol: "OLDER", direction: "LONG", entryPrice: "1", quantity: "1", entryTime: new Date("2025-01-01T00:00:00Z") }).returning();
    const first = await repo.list(user.id);
    const second = await repo.list(user.id, 2);
    assert.deepEqual(first.trades.map(t => t.id), full.trades.map(t => t.id));
    assert.equal(first.hasNext, true);
    assert.deepEqual(second.trades.map(t => t.id), [oldest.id]);
    assert.equal(second.hasNext, false);
    assert.deepEqual(await repo.list(user.id, 3), { trades: [], hasNext: false });
  } finally { await client.close(); }
});

test("tied entry times remain ordered across pages and other owners cannot shift page boundaries", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [owner, other] = await db.insert(users).values([{ email: "ties@test.local" }, { email: "foreign@test.local" }]).returning();
    const accounts = await db.insert(tradingAccounts).values([
      { userId: owner.id, name: "First", balance: "0" },
      { userId: owner.id, name: "Second", balance: "0" },
      { userId: other.id, name: "Other owner", balance: "0" },
    ]).returning();
    const idFor = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
    const entryTime = new Date("2026-01-01T12:00:00Z");
    // Interleave owners and accounts at the same timestamp, including UUIDs
    // that would occupy the first page if ownership were applied after LIMIT.
    await db.insert(trades).values(Array.from({ length: 60 }, (_, i) => ({
      id: idFor(i + 1), accountId: i % 2 ? accounts[2].id : accounts[(i / 2) % 2].id,
      symbol: "TIED", direction: "LONG", entryPrice: "1", quantity: "1", entryTime,
    })));
    const expected = Array.from({ length: 30 }, (_, i) => idFor(59 - i * 2));
    const repo = tradeRepository(db);
    const first = await repo.list(owner.id);
    const second = await repo.list(owner.id, 2);
    assert.deepEqual(first.trades.map(t => t.id), expected.slice(0, 25));
    assert.deepEqual(second.trades.map(t => t.id), expected.slice(25));
    assert.equal(first.hasNext, true);
    assert.equal(second.hasNext, false);
    assert.equal(new Set([...first.trades, ...second.trades].map(t => t.id)).size, 30);
    assert.deepEqual(await repo.list(owner.id), first, "unchanged data yields the same page");
    const otherPage = await repo.list(other.id);
    assert.ok(otherPage.trades.every(t => t.accountId === accounts[2].id));
    assert.equal(await repo.find(other.id, expected[0]), null);
  } finally { await client.close(); }
});
