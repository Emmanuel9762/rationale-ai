import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts } from "../src/db/schema";
import { accountForUser } from "../src/lib/trade-writes";

test("simultaneous account requests converge and the database rejects a second default", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [user, other] = await db.insert(users).values([{ email: "one@test.local" }, { email: "two@test.local" }]).returning();
    const ids = await Promise.all(Array.from({ length: 8 }, () => accountForUser(db, user.id)));
    assert.equal(new Set(ids).size, 1);
    assert.equal((await db.select().from(tradingAccounts)).length, 1);
    await assert.rejects(db.insert(tradingAccounts).values({ userId: user.id, name: "Duplicate", balance: "0", isDefault: true }));
    assert.notEqual(await accountForUser(db, other.id), ids[0]);
    await db.insert(tradingAccounts).values({ userId: user.id, name: "Other account", balance: "0" });
    assert.equal(await accountForUser(db, user.id), ids[0]);
  } finally { await client.close(); }
});

test("upgrade preserves legacy accounts and trades and chooses oldest account with stable tie-break", async () => {
  const folder = await mkdtemp(join(tmpdir(), "rationale-migrations-"));
  const client = new PGlite(); const db = drizzle(client);
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.slice(0, 2);
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) await copyFile(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
    await migrate(db, { migrationsFolder: folder });
    const { rows: [user] } = await client.query<{ id: string }>("INSERT INTO users(email) VALUES ('dev@rationale-ai.local') RETURNING id");
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    // Raw SQL models the old schema, before is_default existed.
    await client.query("INSERT INTO trading_accounts (id,user_id,name,balance,created_at) VALUES ($1,$3,'First',12,'2026-01-01'),($2,$3,'Second',34,'2026-01-01')", [first, second, user.id]);
    for (const accountId of [first, second]) await client.query("INSERT INTO trades(account_id,symbol,direction,entry_price,quantity,entry_time,rationale) VALUES ($1,'EURUSD','LONG',1,1,'2026-01-01',$2)", [accountId, accountId]);
    const before = (await client.query<Record<string, unknown>>("SELECT * FROM trades ORDER BY id")).rows;
    await migrate(db, { migrationsFolder: "./drizzle" });
    assert.equal(await accountForUser(db, user.id), first);
    const accounts = await db.select().from(tradingAccounts);
    assert.equal(accounts.length, 2);
    assert.equal(accounts.find(a => a.id === first)?.isDefault, true);
    assert.equal(accounts.find(a => a.id === second)?.isDefault, false);
    assert.deepEqual(accounts.map(a => a.balance).sort(), ["12.00", "34.00"]);
    const after = (await client.query<Record<string, unknown>>("SELECT * FROM trades ORDER BY id")).rows;
    assert.deepEqual(after.map(({ plan_adherence, review_went_well, review_improve, reviewed_at, submission_key, submission_hash, revision, ...original }) => {
      assert.deepEqual([plan_adherence, review_went_well, review_improve, reviewed_at, submission_key, submission_hash], [null, null, null, null, null, null]);
      assert.equal(revision, 0);
      return original;
    }), before);
    await migrate(db, { migrationsFolder: "./drizzle" });
    assert.equal((await db.select().from(tradingAccounts)).length, 2);
  } finally { await client.close(); await rm(folder, { recursive: true, force: true }); }
});
