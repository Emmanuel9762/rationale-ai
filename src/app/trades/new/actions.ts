"use server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { parseTradeInput, TradeInputError, type TradeFormState } from "@/lib/trade-input";
import { createOwnedTrade, parseSubmissionKey } from "@/lib/trade-create";

export async function createTrade(_previous: TradeFormState, formData: FormData): Promise<TradeFormState> {
  const user = await requireCurrentUser();
  let id: string;
  let submissionKey: string | undefined;
  try {
    submissionKey = parseSubmissionKey(formData);
    const input = parseTradeInput(formData);
    id = await createOwnedTrade(db, user.id, submissionKey, input);
  } catch (error) {
    return { submissionKey, error: error instanceof TradeInputError ? error.message : "Could not confirm the save. Retry from this form with the same details. If you reload or open a new form, check trade history first." };
  }
  revalidatePath("/");
  revalidatePath("/trades");
  redirect(`/trades/${id}`);
}
