import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, users } from "../src/db/schema";
import { accountForUser, updateOwnedTrade } from "../src/lib/trade-writes";
import { tradeRepository } from "../src/lib/trade-repository";
import { parseReviewInput, saveOwnedReview } from "../src/lib/trade-review";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
test("review validation requires an explicit assessment and reflection; rejects malformed fields", () => {
  const valid = { planAdherence: "partly", reviewWentWell: "  Waited for entry  " };
  assert.deepEqual(parseReviewInput(form(valid)), { planAdherence: "partly", reviewWentWell: "Waited for entry", reviewImprove: null });
  const invalid: Record<string, string>[] = [{}, { planAdherence: "yes", reviewImprove: "Wait" }, { planAdherence: "followed", reviewWentWell: "   " }, { ...valid, reviewImprove: "x".repeat(2001) }];
  for (const fields of invalid) assert.throws(() => parseReviewInput(form(fields)));
  assert.equal(parseReviewInput(form({ ...valid, reviewImprove: "x".repeat(2000) })).reviewImprove?.length, 2000);
  const duplicate = form(valid); duplicate.append("planAdherence", "followed"); assert.throws(() => parseReviewInput(duplicate));
  const file = form(valid); file.set("reviewImprove", new Blob(["test"])); assert.throws(() => parseReviewInput(file));
  assert.equal("userId" in parseReviewInput(form({ ...valid, userId: "forged", pnl: "999" })), false);
});
test("reviews persist and replace independently of trade edits, enforce owner scope and preserve financial data", async () => {
  const client = new PGlite(), db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [owner, other] = await db.insert(users).values([{ email: "review@local.test" }, { email: "other@local.test" }]).returning();
    const accountId = await accountForUser(db, owner.id);
    const input = { symbol: "EURUSD", direction: "LONG", entryPrice: "1", quantity: "2", entryTime: new Date("2026-01-01"), rationale: "Original thesis", notes: "Original notes", setup: null, exitPrice: null, exitTime: null, pnl: null };
    const [trade] = await db.insert(trades).values({ ...input, accountId }).returning();
    assert.equal(trade.reviewedAt, null);
    const review = parseReviewInput(form({ planAdherence: "followed", reviewWentWell: "Patience", reviewImprove: "Sizing" }));
    assert.equal(await saveOwnedReview(db, other.id, trade.id, review), null);
    assert.equal(await saveOwnedReview(db, owner.id, "invalid", review), null);
    assert.equal(await saveOwnedReview(db, owner.id, "00000000-0000-4000-8000-000000000000", review), null);
    assert.equal(await saveOwnedReview(db, owner.id, trade.id, review), trade.id);
    let saved = await tradeRepository(db).find(owner.id, trade.id);
    assert.equal(saved?.reviewWentWell, "Patience"); assert.ok(saved?.reviewedAt);
    assert.equal(await tradeRepository(db).find(other.id, trade.id), null);
    await updateOwnedTrade(db, owner.id, trade.id, { ...input, exitPrice: "2", exitTime: new Date("2026-01-02"), pnl: "12.34" });
    saved = await tradeRepository(db).find(owner.id, trade.id);
    assert.equal(saved?.reviewWentWell, "Patience");
    await saveOwnedReview(db, owner.id, trade.id, parseReviewInput(form({ planAdherence: "not_followed", reviewImprove: "Follow stop" })));
    saved = await tradeRepository(db).find(owner.id, trade.id);
    assert.equal(saved?.reviewWentWell, null); assert.equal(saved?.reviewImprove, "Follow stop"); assert.equal(saved?.planAdherence, "not_followed");
    assert.equal(saved?.rationale, "Original thesis"); assert.equal(saved?.notes, "Original notes"); assert.equal(saved?.pnl, "12.34"); assert.equal(saved?.accountId, accountId);
  } finally { await client.close(); }
});
