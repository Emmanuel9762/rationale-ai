import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { users, tradingAccounts, trades, savedReviews } from "../src/db/schema";
import { reviewEvidence } from "../src/lib/review-evidence";
import { prepareReviewRequest } from "../src/lib/review-response";
import { saveManualReview, findSavedReview, reviewHistory } from "../src/lib/saved-reviews";

test("saved reviews retain their exact evidence after edits, isolate owners and reject stale/foreign/oversized saves", async () => {
  const client = new PGlite(), db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [a, b] = await db.insert(users).values([{ email: "saved-a@test.local" }, { email: "saved-b@test.local" }]).returning();
    const [account] = await db.insert(tradingAccounts).values({ userId: a.id, name: "Paper", balance: "0" }).returning();
    const [trade] = await db.insert(trades).values({ accountId: account.id, symbol: "EURUSD", direction: "LONG",
      entryPrice: "1.1", quantity: "2", entryTime: new Date("2026-10-01T00:00:00Z"),
      exitPrice: "1.2", exitTime: new Date("2026-10-01T01:00:00Z"), pnl: "0.10", notes: "Original private note" }).returning();
    const period = { from: "2026-10-01", to: "2026-10-01" };
    const evidence = await reviewEvidence(db, a.id, period);
    const response = { version: 1, evidenceId: prepareReviewRequest(evidence).evidenceId,
      observations: [{ text: "<script>unsafe()</script>", tradeIds: [trade.id], metricKeys: ["recordedPnl"] }],
      hypotheses: [], questions: ["What defined the setup?"], experiment: { action: "Record entry conditions.", check: "Compare the later reflection." } };
    const raw = JSON.stringify(response);
    assert.deepEqual(await reviewHistory(db, a.id), { reviews: [], hasNext: false });
    const id = await saveManualReview(db, a.id, raw, period);
    assert.equal(await saveManualReview(db, a.id, JSON.stringify(response, null, 2), period), id);
    assert.equal((await db.select().from(savedReviews)).length, 1);
    const saved = await findSavedReview(db, a.id, id);
    assert.deepEqual(saved?.evidence, evidence, "database JSON round trip preserves the exact fingerprint input");
    assert.equal(saved?.view.draft.metrics.recordedPnl, "0.10");
    assert.equal(saved?.view.draft.observations[0].text, "<script>unsafe()</script>");
    assert.ok(saved?.view.sources[0].href.includes("returnTo="));
    for (const bad of [randomUUID(), "invalid"]) assert.equal(await findSavedReview(db, a.id, bad), null);
    assert.equal(await findSavedReview(db, b.id, id), null);
    assert.deepEqual(await reviewHistory(db, b.id), { reviews: [], hasNext: false });
    await assert.rejects(saveManualReview(db, b.id, raw, period));
    await assert.rejects(saveManualReview(db, a.id, raw, { from: "bad" }));
    await assert.rejects(saveManualReview(db, a.id, raw, { from: "2099-01-01" }));
    await assert.rejects(saveManualReview(db, a.id, "x".repeat(16385), period));
    await assert.rejects(saveManualReview(db, a.id, JSON.stringify({ ...response, observations: [{ ...response.observations[0], tradeIds: [randomUUID()] }] }), period));
    assert.equal((await db.select().from(savedReviews)).length, 1);
    await db.update(trades).set({ notes: "Changed later", pnl: "500", revision: 1 }).where(eq(trades.id, trade.id));
    await assert.rejects(saveManualReview(db, a.id, raw, period), /does not match/);
    const reopened = await findSavedReview(db, a.id, id);
    assert.deepEqual(reopened?.evidence, evidence);
    assert.equal(reopened?.evidence.entries[0].notes, "Original private note");
    assert.equal(reopened?.view.draft.metrics.recordedPnl, "0.10");
    const [stored] = await db.select().from(savedReviews);
    await db.insert(savedReviews).values(Array.from({ length: 26 }, (_, i) => ({ userId: a.id,
      evidenceId: stored.evidenceId, responseHash: `test-${i}`, evidence, response: stored.response, createdAt: new Date("2020-01-01") })));
    const p1 = await reviewHistory(db, a.id), p2 = await reviewHistory(db, a.id, 2);
    assert.equal(p1.reviews.length, 25); assert.equal(p1.hasNext, true);
    assert.equal(p2.reviews.length, 2); assert.equal(p2.hasNext, false);
    const all = [...p1.reviews, ...p2.reviews];
    assert.equal(new Set(all.map(row => row.id)).size, 27);
    assert.equal(p1.reviews[0].id, id);
    assert.deepEqual(all.slice(1).map(row => row.id), all.slice(1).map(row => row.id).sort().reverse());
    assert.equal(p1.reviews[0].from, period.from); assert.equal(p1.reviews[0].included, 1);
    assert.ok(!Object.hasOwn(p1.reviews[0], "response")); assert.ok(!Object.hasOwn(p1.reviews[0], "evidence"));
    assert.deepEqual(await reviewHistory(db, a.id, 3), { reviews: [], hasNext: false });
    await assert.rejects(db.insert(savedReviews).values({ ...stored, id: randomUUID(), userId: randomUUID() }));
  } finally { await client.close(); }
});
