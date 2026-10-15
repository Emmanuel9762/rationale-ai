import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { journalReturnHref, tradeContextHref } from "@/lib/journal-navigation";
import type { JournalSearchParams } from "@/lib/journal-filters";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";

import { ReviewForm } from "./review-form";
import { saveReview } from "./review-actions";

export const dynamic = "force-dynamic";
export default async function TradePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const trade = await tradeRepository(db).find(user.id, (await params).id);
  if (!trade) notFound();
  const returnTo = journalReturnHref((await searchParams).returnTo);
  const fields = [
    ["Direction", trade.direction], ["Status", trade.exitTime && trade.exitPrice !== null ? "Closed" : "Open / incomplete"],
    ["Entry price", trade.entryPrice], ["Exit price", trade.exitPrice], ["Quantity", trade.quantity], ["Recorded P&L", trade.pnl],
    ["Entry time (UTC)", trade.entryTime.toISOString()], ["Exit time (UTC)", trade.exitTime?.toISOString()],
    ["Setup", trade.setup],
  ];
  return <main className="journal-shell journal-detail min-h-screen text-zinc-100"><div className="mx-auto max-w-4xl space-y-6">
    <Link className="text-sm underline" href={returnTo}>Back to trades</Link>
    <header className="journal-heading"><div><p className="journal-eyebrow">Trade record</p><h1>{trade.symbol}</h1><p className="mt-2 text-zinc-400">{trade.setup || "No setup recorded"} · {trade.direction}</p></div><a className="journal-secondary" href="#review">Jump to review ↓</a></header>
    <Link className="journal-primary" href={tradeContextHref(trade.id, returnTo, true)}>Edit or close trade</Link>
    <section aria-label="Execution" className="journal-detail-section"><h2>Execution</h2><dl className="grid gap-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value ?? "Not recorded"}</dd></div>)}</dl></section>
    <section className="journal-detail-section" aria-labelledby="reasoning-title"><h2 id="reasoning-title">The thinking behind the trade</h2><dl className="grid gap-6 sm:grid-cols-2">{[["Rationale",trade.rationale],["Notes",trade.notes]].map(([label,value])=><div key={label}><dt className="journal-eyebrow">{label}</dt><dd className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-zinc-300">{value || "Not recorded"}</dd></div>)}</dl></section>
    <section id="review" aria-labelledby="review-title" className="journal-detail-section scroll-mt-6 space-y-4">
      <h2 id="review-title" className="text-xl font-semibold">Trade review</h2>
      <p className="text-sm text-zinc-400">Reflect on your execution separately from profit or loss. Reviews are available for open and closed trades. Choose an answer and add at least one reflection (up to 2,000 characters each). Saving replaces your previous review.</p>
      <p className="text-sm">{trade.reviewedAt ? `Last saved (UTC): ${trade.reviewedAt.toISOString()}` : "Not reviewed yet."}</p>
      <ReviewForm key={trade.id} revision={trade.revision} reloadHref={tradeContextHref(trade.id, returnTo)} action={saveReview.bind(null, trade.id)} initial={{ planAdherence: trade.planAdherence, reviewWentWell: trade.reviewWentWell, reviewImprove: trade.reviewImprove }}/>
    </section>
  </div></main>;
}
