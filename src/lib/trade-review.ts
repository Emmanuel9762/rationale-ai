import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { trades, tradingAccounts } from "../db/schema";
import { isTradeId } from "./trade-repository";

import { checkRevision, TradeConflictError } from "./trade-version";

export type ReviewInput = {
  planAdherence: "followed" | "partly" | "not_followed";
  reviewWentWell: string | null;
  reviewImprove: string | null;
};
export class ReviewInputError extends Error {}
export function parseReviewInput(data: FormData): ReviewInput {
  function field(name: string) {
    const values = data.getAll(name);
    if (values.length > 1 || (values.length === 1 && typeof values[0] !== "string")) throw new ReviewInputError("Invalid review fields.");
    return (values[0] as string | undefined)?.trim() ?? "";
  }
  const planAdherence = field("planAdherence");
  if (planAdherence !== "followed" && planAdherence !== "partly" && planAdherence !== "not_followed") throw new ReviewInputError("Choose whether you followed your plan.");
  const reviewWentWell = field("reviewWentWell"), reviewImprove = field("reviewImprove");
  if (reviewWentWell.length > 2000 || reviewImprove.length > 2000) throw new ReviewInputError("Each reflection must be 2,000 characters or fewer.");
  if (!reviewWentWell && !reviewImprove) throw new ReviewInputError("Add what went well or what you would improve.");
  return { planAdherence, reviewWentWell: reviewWentWell || null, reviewImprove: reviewImprove || null };
}

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
