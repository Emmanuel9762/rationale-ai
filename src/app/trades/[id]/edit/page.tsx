import { JournalShell, JournalHeader } from "@/app/journal-shell";
import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { journalReturnHref, tradeContextHref } from "@/lib/journal-navigation";
import type { JournalSearchParams } from "@/lib/journal-filters";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";
import { TradeForm } from "../../trade-form";
import { updateTrade } from "./actions";
export const dynamic = "force-dynamic";
export default async function EditTradePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const trade = await tradeRepository(db).find(user.id, id);
  if (!trade) notFound();
  const returnTo = journalReturnHref((await searchParams).returnTo);
  const initial = Object.fromEntries(Object.entries(trade).map(([key, value]) => [key, value instanceof Date ? value.toISOString().slice(0, 16) : String(value ?? "")]));
  return <JournalShell active="journal" narrow><Link href={tradeContextHref(id, returnTo)} className="text-sm underline">Back to trade</Link><JournalHeader eyebrow="Update your record" title={`Edit or close ${trade.symbol}`}/><TradeForm revision={trade.revision} reloadHref={tradeContextHref(id, returnTo, true)} action={updateTrade.bind(null, id, returnTo)} initial={initial} submitLabel="Save changes"/></JournalShell>;
}
