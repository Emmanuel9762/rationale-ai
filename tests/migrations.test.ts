import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("review-history migration upgrades a populated CP56 database without changing existing journal rows", async () => {
  const folder = await mkdtemp(join(tmpdir(), "rationale-migration-"));
  const client = new PGlite(), db = drizzle(client);
  try {
    await cp("./drizzle", folder, { recursive: true });
    const journalPath = join(folder, "meta/_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    journal.entries = journal.entries.slice(0, 9);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrate(db, { migrationsFolder: folder });
    const [user] = await db.insert(users).values({ email: "upgrade@test.local" }).returning();
    const [account] = await db.insert(tradingAccounts).values({ userId: user.id, name: "Paper", balance: "1000.50" }).returning();
    await db.insert(trades).values({ accountId: account.id, symbol: "AAPL", direction: "LONG", entryPrice: "200", quantity: "3", entryTime: new Date(), notes: "Keep this" });
    const before = { users: await db.select().from(users), accounts: await db.select().from(tradingAccounts), trades: await db.select().from(trades) };
    await migrate(db, { migrationsFolder: "./drizzle" });
    assert.deepEqual({ users: await db.select().from(users), accounts: await db.select().from(tradingAccounts), trades: await db.select().from(trades) }, before);
    assert.equal((await client.query<{ n: number }>("select count(*)::int n from saved_reviews")).rows[0].n, 0);
    await migrate(db, { migrationsFolder: "./drizzle" });
    assert.equal((await client.query("select * from drizzle.__drizzle_migrations")).rows.length, 10);
  } finally { await client.close(); await rm(folder, { recursive: true, force: true }); }
});

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
    assert.equal(history.rows.length, 10);
    await assert.rejects(db.insert(trades).values({ accountId: "00000000-0000-4000-8000-000000000000", symbol: "EURUSD", direction: "LONG", entryPrice: "1", quantity: "1", entryTime: new Date() }));
  } finally {
    await client.close();
  }
});
