"use server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { parseTradeInput, TradeInputError, type TradeFormState } from "@/lib/trade-input";
import { accountForUser } from "@/lib/trade-writes";

export async function createTrade(_previous: TradeFormState, formData: FormData): Promise<TradeFormState> {
  const user = await requireCurrentUser();
  let id: string;
  try {
    const input = parseTradeInput(formData);
    const accountId = await accountForUser(db, user.id);
    const [trade] = await db.insert(trades).values({ ...input, accountId }).returning({ id: trades.id });
    id = trade.id;
  } catch (error) {
    return { error: error instanceof TradeInputError ? error.message : "Could not confirm that the trade was saved. Check history before retrying." };
  }
  revalidatePath("/");
  revalidatePath("/trades");
  redirect(`/trades/${id}`);
}
