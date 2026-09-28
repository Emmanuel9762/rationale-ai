import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { DEVELOPMENT_EMAIL, tradeRepository } from "@/lib/trade-repository";

export const dynamic = "force-dynamic";
export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const trade = await tradeRepository(db).find(DEVELOPMENT_EMAIL, (await params).id);
  if (!trade) notFound();
  const fields = [
    ["Direction", trade.direction], ["Status", trade.exitTime && trade.exitPrice !== null ? "Closed" : "Open / incomplete"],
    ["Entry price", trade.entryPrice], ["Exit price", trade.exitPrice], ["Quantity", trade.quantity], ["Recorded P&L", trade.pnl],
    ["Entry time (UTC)", trade.entryTime.toISOString()], ["Exit time (UTC)", trade.exitTime?.toISOString()],
    ["Setup", trade.setup], ["Rationale", trade.rationale], ["Notes", trade.notes],
  ];
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100"><div className="mx-auto max-w-3xl space-y-6">
    <Link className="text-sm underline" href="/trades">Back to trades</Link>
    <h1 className="text-2xl font-semibold">{trade.symbol}</h1>
    <Link className="inline-block rounded-lg bg-zinc-100 px-4 py-2 text-zinc-950" href={`/trades/${trade.id}/edit`}>Edit or close trade</Link>
    <dl className="grid gap-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className={label === "Rationale" || label === "Notes" ? "sm:col-span-2" : ""}><dt className="text-sm text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value ?? "Not recorded"}</dd></div>)}</dl>
  </div></main>;
}
