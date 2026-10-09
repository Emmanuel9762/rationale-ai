import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";
import { TradeForm } from "../../trade-form";
import { updateTrade } from "./actions";
export const dynamic = "force-dynamic";
export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const trade = await tradeRepository(db).find(user.id, id);
  if (!trade) notFound();
  const initial = Object.fromEntries(Object.entries(trade).map(([key, value]) => [key, value instanceof Date ? value.toISOString().slice(0, 16) : String(value ?? "")]));
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100"><div className="mx-auto max-w-3xl space-y-6"><Link href={`/trades/${id}`} className="text-sm underline">Back to trade</Link><h1 className="text-2xl font-semibold">Edit or close {trade.symbol}</h1><TradeForm revision={trade.revision} reloadHref={`/trades/${id}/edit`} action={updateTrade.bind(null, id)} initial={initial} submitLabel="Save changes"/></div></main>;
}
