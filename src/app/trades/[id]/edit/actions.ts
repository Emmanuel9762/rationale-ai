"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { DEVELOPMENT_EMAIL } from "@/lib/trade-repository";
import { parseTradeInput, TradeInputError, type TradeFormState } from "@/lib/trade-input";
import { updateOwnedTrade } from "@/lib/trade-writes";
export async function updateTrade(id: string, _previous: TradeFormState, data: FormData): Promise<TradeFormState> {
  try {
    const input = parseTradeInput(data);
    const updated = await updateOwnedTrade(db, DEVELOPMENT_EMAIL, id, input);
    if (!updated) return { error: "Trade not found or unavailable." };
  } catch (error) {
    return { error: error instanceof TradeInputError ? error.message : "Could not confirm the update. Check the trade before retrying." };
  }
  revalidatePath("/");
  revalidatePath("/trades");
  revalidatePath(`/trades/${id}`);
  revalidatePath(`/trades/${id}/edit`);
  redirect(`/trades/${id}`);
}
