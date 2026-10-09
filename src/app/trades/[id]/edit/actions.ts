"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseTradeInput, TradeInputError, type TradeFormState } from "@/lib/trade-input";
import { updateOwnedTrade } from "@/lib/trade-writes";
import { draftValues, parseRevision, TradeConflictError } from "@/lib/trade-version";
export async function updateTrade(id: string, _previous: TradeFormState, data: FormData): Promise<TradeFormState> {
  const user = await requireCurrentUser();
  let revision: number | undefined;
  const values = draftValues(data, ["symbol", "direction", "entryPrice", "quantity", "entryTime", "exitPrice", "exitTime", "pnl", "setup", "rationale", "notes"]);
  try {
    revision = parseRevision(data);
    const input = parseTradeInput(data);
    const updated = await updateOwnedTrade(db, user.id, id, input, revision);
    if (!updated) return { error: "Trade not found or unavailable.", revision, values };
  } catch (error) {
    return { revision, values, conflict: error instanceof TradeConflictError, error: error instanceof TradeInputError || error instanceof TradeConflictError ? error.message : "Could not confirm the update. Copy your changes and reload the trade before retrying." };
  }
  revalidatePath("/");
  revalidatePath("/trades");
  revalidatePath(`/trades/${id}`);
  revalidatePath(`/trades/${id}/edit`);
  redirect(`/trades/${id}`);
}
