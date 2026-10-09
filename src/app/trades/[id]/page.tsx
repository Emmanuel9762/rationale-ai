import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";

import { ReviewForm } from "./review-form";
import { saveReview } from "./review-actions";

export const dynamic = "force-dynamic";
export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const trade = await tradeRepository(db).find(user.id, (await params).id);
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
    <section id="review" aria-labelledby="review-title" className="space-y-4 rounded-xl border border-zinc-800 p-6">
      <h2 id="review-title" className="text-xl font-semibold">Trade review</h2>
      <p className="text-sm text-zinc-400">Reflect on your execution separately from profit or loss. Reviews are available for open and closed trades. Choose an answer and add at least one reflection (up to 2,000 characters each). Saving replaces your previous review.</p>
      <p className="text-sm">{trade.reviewedAt ? `Last saved (UTC): ${trade.reviewedAt.toISOString()}` : "Not reviewed yet."}</p>
      <ReviewForm key={trade.id} revision={trade.revision} reloadHref={`/trades/${trade.id}`} action={saveReview.bind(null, trade.id)} initial={{ planAdherence: trade.planAdherence, reviewWentWell: trade.reviewWentWell, reviewImprove: trade.reviewImprove }}/>
    </section>
  </div></main>;
}
