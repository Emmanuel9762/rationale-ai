import Link from "next/link";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { reviewEvidence, EVIDENCE_LIMIT, EVIDENCE_TEXT_LIMIT } from "@/lib/review-evidence";
import { journalHref, parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { tradeContextHref } from "@/lib/journal-navigation";
import { formatPnl } from "@/lib/trade-metrics";
import { isPlanAdherenceGroup, PLAN_ADHERENCE_LABELS } from "@/lib/plan-adherence";

export const dynamic = "force-dynamic";
const narrativeLabels: Record<string,string> = {rationale:"Rationale",notes:"Notes",reviewWentWell:"What went well",reviewImprove:"What to improve"};

export default async function ReviewEvidencePage({searchParams}: {searchParams:Promise<JournalSearchParams>}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const {filters:period,errors} = parseJournalFilters({from:params.from,to:params.to});
  const evidence = errors.length ? null : await reviewEvidence(db,user.id,params);
  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="flex flex-wrap gap-5 text-sm"><Link href="/">Dashboard</Link><Link href="/trades">Trade history</Link><Link href={journalHref(period).replace("/trades","/performance")}>Performance</Link></nav>
      <header className="space-y-2"><p className="journal-eyebrow">Prepare your review</p><h1 className="text-3xl font-semibold">Review evidence</h1><p className="text-zinc-400">Check what your journal can support before drawing conclusions. No AI analysis has been generated and nothing is sent to a model.</p></header>
      <form key={`${period.from ?? ""}:${period.to ?? ""}:${errors.join("|")}`} action="/review-evidence" method="get" className="journal-detail-section flex flex-wrap items-end gap-4">
        {([['from','From entry date (UTC)'],['to','Through entry date (UTC)']] as const).map(([name,label])=><label key={name} className="text-sm">{label}<input type="date" name={name} className="journal-field" defaultValue={typeof params[name] === "string" ? params[name] : ""}/></label>)}
        <button className="journal-primary">Apply dates</button><Link className="underline" href="/review-evidence">All time</Link>
      </form>
      {errors.length > 0 && <div role="alert" className="journal-detail-section text-red-300"><p>Check your dates.</p><ul>{errors.map(error=><li key={error}>{error}</li>)}</ul></div>}
      {evidence && <>
        <section aria-label="Evidence coverage" className="journal-detail-section space-y-4">
          <h2>Evidence coverage</h2>
          <p className="text-sm text-zinc-400">{period.from ?? "Beginning"} through {period.to ?? "no end limit"} · UTC entry dates · All your accounts</p>
          {evidence.hasMore && <p role="status" className="rounded-lg border border-amber-800 p-3 text-amber-200">Partial snapshot: only the newest {EVIDENCE_LIMIT} matching trades are included. Narrow the dates to inspect older trades. Every count and total below describes this included sample only.</p>}
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            {([['Included trades',evidence.coverage.included],['Open / incomplete',evidence.coverage.open],['Closed with P&L',evidence.coverage.measured],['Closed without P&L',evidence.coverage.missingPnl],['Marked reviewed',evidence.coverage.reviewed],['Missing rationale',evidence.coverage.missingRationale],['Missing setup',evidence.coverage.missingSetup],['No review notes',evidence.coverage.missingReviewText],['Shortened text fields',evidence.coverage.truncatedTextFields]] as const).map(([label,value])=><div key={label}><dt className="text-sm text-zinc-400">{label}</dt><dd className="text-2xl tabular-nums">{value}</dd></div>)}
          </dl>
          <p>Recorded P&amp;L for included closed trades: <strong>{evidence.recordedPnl === null ? "Not available" : formatPnl(evidence.recordedPnl)}</strong></p>
          <p className="text-sm text-zinc-400">P&amp;L is recorded, not calculated, and assumes a common account currency. Missing P&amp;L is excluded. Entry dates determine inclusion even if a trade closed later.</p>
          <Link className="underline" href={journalHref(period)}>Open matching journal</Link>
        </section>
        {evidence.entries.length === 0 ? <p className="journal-detail-section">No trades match these entry dates. Change the dates or <Link href="/trades/new" className="underline">log a trade</Link>.</p> : <section aria-label="Included evidence" className="space-y-4">
          <h2 className="text-xl font-semibold">Inspect the included trades</h2>
          <p className="text-sm text-zinc-400">Newest entry first. Open a trade to add missing rationale or review notes. A saved review is a self-assessment, not a quality score.</p>
          {evidence.entries.map(entry=><article key={entry.id} className="journal-detail-section space-y-3" aria-label={`Evidence for ${entry.symbol}`}>
            <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{entry.symbol} · {entry.direction}</h3><p className="text-sm text-zinc-400">{entry.entryTime} · {entry.status} · {entry.reviewedAt ? "Reviewed" : "Not reviewed"}</p></div><Link className="underline" href={tradeContextHref(entry.id,journalHref(period))}>Open trade</Link></div>
            <p className="text-sm">Setup: {entry.setup ?? "Missing"} · Rationale: {entry.rationale ? "Recorded" : "Missing"} · Review notes: {entry.reviewWentWell || entry.reviewImprove ? "Recorded" : "Missing"}</p>
            <details><summary className="cursor-pointer">Read evidence</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {([['Entry price',entry.entryPrice],['Exit price',entry.exitPrice],['Quantity',entry.quantity],['Exit time (UTC)',entry.exitTime],['Recorded P&L',entry.recordedPnl],['Plan adherence',isPlanAdherenceGroup(entry.planAdherence) ? PLAN_ADHERENCE_LABELS[entry.planAdherence] : null],['Rationale',entry.rationale],['Notes',entry.notes],['What went well',entry.reviewWentWell],['What to improve',entry.reviewImprove]] as const).map(([label,value])=><div key={label} className="min-w-0"><dt className="text-sm text-zinc-400">{label}</dt><dd className="whitespace-pre-wrap break-words">{value ?? "Not recorded"}</dd></div>)}
            </dl>{entry.truncatedFields.length > 0 && <p className="mt-3 text-sm text-amber-200">Shortened to {EVIDENCE_TEXT_LIMIT} characters: {entry.truncatedFields.map(field=>narrativeLabels[field]).join(", ")}. Open the trade for the complete text.</p>}</details>
          </article>)}
        </section>}
      </>}
      <aside className="journal-detail-section space-y-2 text-sm text-zinc-400"><h2>What this evidence cannot establish</h2><p>This is a current journal snapshot, not an AI verdict or a historical audit. Later edits can change it, and existing reviews are not cleared by trade edits. Notes may have been written after the trade.</p><p>No structured pre-trade stop, target or risk plan is captured yet. Missing notes and small samples limit conclusions; complete fields do not prove a trading edge. Text excerpts are limited to {EVIDENCE_TEXT_LIMIT} characters per field.</p></aside>
    </div>
  </main>;
}
