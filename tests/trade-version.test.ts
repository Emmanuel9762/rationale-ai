import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, users } from "../src/db/schema";
import { accountForUser, updateOwnedTrade } from "../src/lib/trade-writes";
import { saveOwnedReview } from "../src/lib/trade-review";
import { parseRevision, TradeConflictError } from "../src/lib/trade-version";
import { tradeRepository } from "../src/lib/trade-repository";

test("form revisions reject missing, repeated, malformed and out-of-range values", () => {
  for (const value of ["", "-1", "1.5", "1e2", "01", "2147483647", "9007199254740993", " 1 "]) {
    const data = new FormData(); data.set("revision", value); assert.throws(() => parseRevision(data));
  }
  assert.throws(() => parseRevision(new FormData()));
  const data = new FormData(); data.set("revision", "0"); assert.equal(parseRevision(data), 0);
  data.set("revision", "2147483646"); assert.equal(parseRevision(data), 2147483646);
  data.append("revision", "0"); assert.throws(() => parseRevision(data));
});

test("atomic revision checks prevent stale edits, reviews and cross-form overwrites without disclosing other owners", async () => {
  const client = new PGlite(), db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [owner, other] = await db.insert(users).values([{ email: "version@local.test" }, { email: "outsider@local.test" }]).returning();
    const accountId = await accountForUser(db, owner.id);
    const input = { symbol: "EURUSD", direction: "LONG", entryPrice: "1", quantity: "2", entryTime: new Date("2026-01-01"), rationale: "Original", notes: null, setup: null, exitPrice: null, exitTime: null, pnl: null };
    const [trade] = await db.insert(trades).values({ ...input, accountId }).returning();
    const review = { planAdherence: "partly" as const, reviewWentWell: "Waited", reviewImprove: null };
    const read = () => tradeRepository(db).find(owner.id, trade.id);
    assert.equal(trade.revision, 0);
    const attempts = await Promise.allSettled([updateOwnedTrade(db, owner.id, trade.id, { ...input, notes: "Tab A" }, 0), updateOwnedTrade(db, owner.id, trade.id, { ...input, notes: "Tab B" }, 0)]);
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
    const rejected = attempts.find(r => r.status === "rejected"); assert.ok(rejected?.status === "rejected" && rejected.reason instanceof TradeConflictError);
    const first = (await read())!; assert.equal(first.revision, 1);
    await assert.rejects(saveOwnedReview(db, owner.id, trade.id, review, 0), TradeConflictError);
    assert.deepEqual(await read(), first);
    assert.equal(await updateOwnedTrade(db, other.id, trade.id, input, 0), null);
    assert.equal(await saveOwnedReview(db, other.id, trade.id, review, 1), null);
    assert.equal(await saveOwnedReview(db, owner.id, trade.id, review, 1), trade.id);
    const reviewed = (await read())!; assert.equal(reviewed.revision, 2);
    await assert.rejects(saveOwnedReview(db, owner.id, trade.id, { ...review, reviewWentWell: "Stale" }, 1), TradeConflictError);
    await assert.rejects(updateOwnedTrade(db, owner.id, trade.id, input, 1), TradeConflictError);
    assert.deepEqual(await read(), reviewed);
    // Reload supplies the current revision; a deliberate new save now succeeds.
    assert.equal(await updateOwnedTrade(db, owner.id, trade.id, { ...input, notes: "Reconciled" }, reviewed.revision), trade.id);
    const final = (await read())!; assert.equal(final.revision, 3); assert.equal(final.notes, "Reconciled"); assert.equal(final.reviewWentWell, "Waited");
    await assert.rejects(updateOwnedTrade(db, owner.id, trade.id, input, NaN));
    assert.equal(await updateOwnedTrade(db, owner.id, "00000000-0000-4000-8000-000000000000", input, 0), null);
  } finally { await client.close(); }
});
