import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, users } from "../src/db/schema";
import { createOwnedTrade, parseSubmissionKey } from "../src/lib/trade-create";
import { parseTradeInput } from "../src/lib/trade-input";
import { tradeRepository } from "../src/lib/trade-repository";
import { updateOwnedTrade } from "../src/lib/trade-writes";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const fields = { symbol: "EURUSD", direction: "LONG", entryPrice: "1.10", quantity: "2", entryTime: "2026-01-01T12:00", rationale: "Original reason" };

test("submission keys require exactly one UUID and normalize its case", () => {
  const key = randomUUID();
  assert.equal(parseSubmissionKey(form({ submissionKey: key.toUpperCase() })), key);
  for (const value of ["", "invalid", "' OR 1=1 --"]) assert.throws(() => parseSubmissionKey(form({ submissionKey: value })));
  assert.throws(() => parseSubmissionKey(new FormData()));
  const duplicate = form({ submissionKey: key }); duplicate.append("submissionKey", key);
  assert.throws(() => parseSubmissionKey(duplicate));
  const file = new FormData(); file.set("submissionKey", new Blob([key]));
  assert.throws(() => parseSubmissionKey(file));
});

test("repeat submissions converge, differing payloads are rejected, new keys and other owners stay independent", async () => {
  const client = new PGlite(), db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [owner, other] = await db.insert(users).values([{ email: "retry@local.test" }, { email: "other@local.test" }]).returning();
    const key = randomUUID(), input = parseTradeInput(form(fields));
    // Concurrent calls through PGlite verify the SQL constraint/algorithm, not Neon network timing.
    const ids = await Promise.all(Array.from({ length: 8 }, () => createOwnedTrade(db, owner.id, key, input)));
    assert.equal(new Set(ids).size, 1);
    assert.equal((await db.select().from(trades)).length, 1);
    const originalId = ids[0];
    // Model a committed save whose response was lost: resend the original key/payload.
    assert.equal(await createOwnedTrade(db, owner.id, key, input), originalId);
    assert.equal(await createOwnedTrade(db, owner.id, key, parseTradeInput(form({ ...fields, entryPrice: "01.100000", quantity: "02.0" }))), originalId);
    for (const changed of [{ symbol: "GBPUSD" }, { notes: "Changed" }, { quantity: "3" }, { entryTime: new Date("2026-01-02") }]) {
      await assert.rejects(createOwnedTrade(db, owner.id, key, { ...input, ...changed }), /different details/);
    }
    assert.equal((await db.select().from(trades)).length, 1);
    // The creation fingerprint must survive later edits; retries must never undo them.
    await updateOwnedTrade(db, owner.id, originalId, { ...input, notes: "Later correction" });
    assert.equal(await createOwnedTrade(db, owner.id, key, input), originalId);
    assert.equal((await tradeRepository(db).find(owner.id, originalId))?.notes, "Later correction");
    const separate = await createOwnedTrade(db, owner.id, randomUUID(), input);
    assert.notEqual(separate, originalId);
    const otherId = await createOwnedTrade(db, other.id, key, input);
    assert.notEqual(otherId, originalId);
    assert.equal(await tradeRepository(db).find(other.id, originalId), null);
    assert.equal(await tradeRepository(db).find(owner.id, otherId), null);
    assert.equal((await db.select().from(trades)).length, 3);
    const original = (await tradeRepository(db).find(owner.id, originalId))!;
    await assert.rejects(db.insert(trades).values({ ...input, accountId: original.accountId, submissionKey: key }));
    // Legacy rows without keys still coexist; the new index does not deduplicate history.
    await db.insert(trades).values([{ ...input, accountId: original.accountId }, { ...input, accountId: original.accountId }]);
    assert.equal((await db.select().from(trades)).length, 5);
  } finally { await client.close(); }
});
