"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseReviewInput, ReviewInputError, saveOwnedReview } from "@/lib/trade-review";
import { TradeInputError, type TradeFormState } from "@/lib/trade-input";

import { draftValues, parseRevision, TradeConflictError } from "@/lib/trade-version";

export async function saveReview(id: string, _previous: TradeFormState, data: FormData): Promise<TradeFormState> {
  const user = await requireCurrentUser();
  let revision: number | undefined;
  const values = draftValues(data, ["planAdherence", "reviewWentWell", "reviewImprove"]);
  try {
    revision = parseRevision(data);
    const saved = await saveOwnedReview(db, user.id, id, parseReviewInput(data), revision);
    if (!saved) return { error: "Trade not found or unavailable.", revision, values };
  } catch (error) {
    return { revision, values, conflict: error instanceof TradeConflictError, error: error instanceof ReviewInputError || error instanceof TradeInputError || error instanceof TradeConflictError ? error.message : "Could not confirm the review. Copy your changes and reload the trade before retrying." };
  }
  revalidatePath(`/trades/${id}`);
  revalidatePath(`/trades/${id}/edit`);
  return { error: "", revision: revision + 1, values, notice: "Review saved." };
}
