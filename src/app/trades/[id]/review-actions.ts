"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseReviewInput, ReviewInputError, saveOwnedReview } from "@/lib/trade-review";
import type { TradeFormState } from "@/lib/trade-input";

export async function saveReview(id: string, _previous: TradeFormState, data: FormData): Promise<TradeFormState> {
  const user = await requireCurrentUser();
  try {
    const saved = await saveOwnedReview(db, user.id, id, parseReviewInput(data));
    if (!saved) return { error: "Trade not found or unavailable." };
  } catch (error) {
    return { error: error instanceof ReviewInputError ? error.message : "Could not confirm the review. Reload the trade before retrying." };
  }
  revalidatePath(`/trades/${id}`);
  redirect(`/trades/${id}#review`);
}
