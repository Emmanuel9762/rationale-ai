import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "../db";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { savedReviews } from "../db/schema";
import { checkManualReview, manualReviewPacket } from "./manual-review";
import { reviewEvidence } from "./review-evidence";
import type { JournalSearchParams } from "./journal-filters";

export const REVIEW_HISTORY_PAGE_SIZE = 25;
export function reviewHistoryHref(page = 1) {
  return `/review-evidence/history${page > 1 ? `?page=${page}` : ""}`;
}
export function savedReviewHref(id: string) { return `/review-evidence/history/${id}`; }

// The caller supplies a session owner, never a client snapshot or checked view.
export async function saveManualReview<Q extends PgQueryResultHKT>(database: Pick<PgDatabase<Q>, "select" | "insert">, userId: string, raw: string, period: JournalSearchParams) {
  const evidence = await reviewEvidence(database, userId, period);
  const { draft } = checkManualReview(raw, evidence);
  manualReviewPacket(evidence); // Apply the same whole-snapshot storage bound as downloads.
  // Canonicalize validated output so harmless JSON formatting cannot create duplicates.
  const response = JSON.stringify({ version: draft.version, evidenceId: draft.evidenceId,
    observations: draft.observations, hypotheses: draft.hypotheses,
    questions: draft.questions, experiment: draft.experiment });
  const responseHash = createHash("sha256").update(response).digest("hex");
  const [saved] = await database.insert(savedReviews).values({ userId, evidenceId: draft.evidenceId,
    responseHash, evidence, response }).onConflictDoNothing({ target: [savedReviews.userId, savedReviews.evidenceId, savedReviews.responseHash] })
    .returning({ id: savedReviews.id });
  if (saved) return saved.id;
  const [existing] = await database.select({ id: savedReviews.id }).from(savedReviews)
    .where(and(eq(savedReviews.userId, userId), eq(savedReviews.evidenceId, draft.evidenceId), eq(savedReviews.responseHash, responseHash))).limit(1);
  if (!existing) throw new Error("Save could not be confirmed.");
  return existing.id;
}

export async function reviewHistory(database: Pick<typeof db, "select">, userId: string, page = 1) {
  // List metadata only; do not load 25 full snapshots to display the history.
  const rows = await database.select({ id: savedReviews.id, createdAt: savedReviews.createdAt,
    from: sql<string | null>`${savedReviews.evidence}->'period'->>'from'`,
    to: sql<string | null>`${savedReviews.evidence}->'period'->>'to'`,
    included: sql<number>`json_array_length(${savedReviews.evidence}->'entries')`,
  }).from(savedReviews).where(eq(savedReviews.userId, userId))
    .orderBy(desc(savedReviews.createdAt), desc(savedReviews.id))
    .limit(REVIEW_HISTORY_PAGE_SIZE + 1).offset((page - 1) * REVIEW_HISTORY_PAGE_SIZE);
  return { reviews: rows.slice(0, REVIEW_HISTORY_PAGE_SIZE), hasNext: rows.length > REVIEW_HISTORY_PAGE_SIZE };
}

export async function findSavedReview(database: Pick<typeof db, "select">, userId: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await database.select({ id: savedReviews.id, createdAt: savedReviews.createdAt,
    evidence: savedReviews.evidence, response: savedReviews.response }).from(savedReviews)
    .where(and(eq(savedReviews.userId, userId), eq(savedReviews.id, id))).limit(1);
  if (!row) return null;
  // Rebuild facts, caveats and safe citation links from the original stored evidence.
  return { ...row, view: checkManualReview(row.response, row.evidence) };
}
