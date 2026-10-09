import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { trades, tradingAccounts } from "../db/schema";
import { isTradeId } from "./trade-repository";

import { checkRevision, TradeConflictError } from "./trade-version";

import { type ReviewInput } from "./review-input";
export { parseReviewInput, ReviewInputError, type ReviewInput } from "./review-input";

// Identity is supplied by the authenticated server action; never by form fields.
export async function saveOwnedReview<Q extends PgQueryResultHKT>(database: Pick<PgDatabase<Q>, "select" | "update">, userId: string, id: string, input: ReviewInput, revision: number) {
  checkRevision(revision);
  if (!isTradeId(id)) return null;
  const accounts = database.select({ id: tradingAccounts.id }).from(tradingAccounts).where(eq(tradingAccounts.userId, userId));
  const owned = and(eq(trades.id, id), inArray(trades.accountId, accounts));
  const [saved] = await database.update(trades).set({
    planAdherence: input.planAdherence, reviewWentWell: input.reviewWentWell,
    reviewImprove: input.reviewImprove, reviewedAt: new Date(), revision: sql`${trades.revision} + 1`,
  }).where(and(owned, eq(trades.revision, revision))).returning({ id: trades.id });
  if (saved) return saved.id;
  const [existing] = await database.select({ id: trades.id }).from(trades).where(owned).limit(1);
  if (existing) throw new TradeConflictError();
  return null;
}
