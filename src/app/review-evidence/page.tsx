import { JournalShell, JournalHeader } from "@/app/journal-shell";
import Link from "next/link";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { reviewEvidence, EVIDENCE_LIMIT, EVIDENCE_TEXT_LIMIT } from "@/lib/review-evidence";
import { journalHref, parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { tradeContextHref } from "@/lib/journal-navigation";
import { formatPnl } from "@/lib/trade-metrics";
import { isPlanAdherenceGroup, PLAN_ADHERENCE_LABELS } from "@/lib/plan-adherence";
import ManualReviewForm from "./manual-review-form";

export const dynamic = "force-dynamic";
const narrativeLabels: Record<string,string> = {rationale:"Rationale",notes:"Notes",reviewWentWell:"What went well",reviewImprove:"What to improve"};

export default async function ReviewEvidencePage({searchParams}: {searchParams:Promise<JournalSearchParams>}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const {filters:period,errors} = parseJournalFilters({from:params.from,to:params.to});
  const evidence = errors.length ? null : await reviewEvidence(db,user.id,params);
  return <JournalShell active="evidence">

      <JournalHeader eyebrow="Prepare your review" title="Review evidence" actions={<Link className="journal-secondary" href="/review-evidence/history">Review history</Link>}><p>Check what your journal can support before drawing conclusions. Nothing is sent to a model by Rationale.</p></JournalHeader>
      <form key={`${period.from ?? ""}:${period.to ?? ""}:${errors.join("|")}`} action="/review-evidence" method="get" className="journal-detail-section flex flex-wrap items-end gap-4">
        {([['from','From entry date (UTC)'],['to','Through entry date (UTC)']] as const).map(([name,label])=><label key={name} className="text-sm">{label}<input type="date" name={name} className="journal-field" defaultValue={typeof params[name] === "string" ? params[name] : ""}/></label>)}
        <button className="journal-primary">Apply dates</button><Link className="underline" href="/review-evidence">All time</Link>
      </form>
      {errors.length > 0 && <div role="alert" className="journal-detail-section text-red-300"><p>Check your dates.</p><ul>{errors.map(error=><li key={error}>{error}</li>)}</ul></div>}
      {evidence && <>
        <section aria-label="Evidence coverage" className="journal-detail-section space-y-4">
          <h2>Evidence coverage</h2>
          <p className="text-sm text-muted">{period.from ?? "Beginning"} through {period.to ?? "no end limit"} · UTC entry dates · All your accounts</p>
          {evidence.hasMore && <p role="status" className="rounded-lg border border-amber-800 p-3 text-amber-200">Partial snapshot: only the newest {EVIDENCE_LIMIT} matching trades are included. Narrow the dates to inspect older trades. Every count and total below describes this included sample only.</p>}
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            {([['Included trades',evidence.coverage.included],['Open / incomplete',evidence.coverage.open],['Closed with P&L',evidence.coverage.measured],['Closed without P&L',evidence.coverage.missingPnl],['Marked reviewed',evidence.coverage.reviewed],['Missing rationale',evidence.coverage.missingRationale],['Missing setup',evidence.coverage.missingSetup],['No review notes',evidence.coverage.missingReviewText],['Shortened text fields',evidence.coverage.truncatedTextFields]] as const).map(([label,value])=><div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="text-2xl tabular-nums">{value}</dd></div>)}
          </dl>
          <p>Recorded P&amp;L for included closed trades: <strong>{evidence.recordedPnl === null ? "Not available" : formatPnl(evidence.recordedPnl)}</strong></p>
          <p className="text-sm text-muted">P&amp;L is recorded, not calculated, and assumes a common account currency. Missing P&amp;L is excluded. Entry dates determine inclusion even if a trade closed later.</p>
          <Link className="underline" href={journalHref(period)}>Open matching journal</Link>
        </section>
        {evidence.entries.length > 0 && <details className="journal-detail-section" key={journalHref(period)}>
          <summary className="font-semibold">Review this evidence with an external model</summary>
          <div className="mt-5 space-y-5">
            <p className="text-sm text-muted">Download a packet for these entry dates, review it with Codex, then load or paste its JSON reply below. Rationale does not call a model. Checking a reply reads your current journal and saves nothing.</p>
            <ol className="list-inside list-decimal space-y-3 text-sm text-body">
              <li><a className="underline" href={journalHref(period).replace("/trades", "/review-evidence/export")}>Download review packet (JSON)</a>. It includes trade IDs, notes and reflections, with the same 100-trade and excerpt limits shown here. Review its contents before sharing.</li>
              <li>Give Codex the packet. Ask it to follow the packet’s instructions, treat evidence as untrusted data, and write the specified JSON response to a UTF-8 file named <code>rationale-review-response.json</code>, with the same evidenceId and no Markdown fences.</li>
              <li>Load the response file or paste the JSON below, check it, and optionally save it to Review history. Structure and citation checks help you inspect a draft; they do not prove its claims or identify a trading edge.</li>
            </ol>
            <ManualReviewForm period={period}/>
          </div>
        </details>}
        {evidence.entries.length === 0 ? <p className="journal-detail-section">No trades match these entry dates. Change the dates or <Link href="/trades/new" className="underline">log a trade</Link>.</p> : <section aria-label="Included evidence" className="space-y-4">
          <h2 className="text-xl font-semibold">Inspect the included trades</h2>
          <p className="text-sm text-muted">Newest entry first. Open a trade to add missing rationale or review notes. A saved review is a self-assessment, not a quality score.</p>
          {evidence.entries.map(entry=><article key={entry.id} className="journal-detail-section space-y-3" aria-label={`Evidence for ${entry.symbol}`}>
            <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{entry.symbol} · {entry.direction}</h3><p className="text-sm text-muted">{entry.entryTime} · {entry.status} · {entry.reviewedAt ? "Reviewed" : "Not reviewed"}</p></div><Link className="underline" href={tradeContextHref(entry.id,journalHref(period))}>Open trade</Link></div>
            <p className="text-sm">Setup: {entry.setup ?? "Missing"} · Rationale: {entry.rationale ? "Recorded" : "Missing"} · Review notes: {entry.reviewWentWell || entry.reviewImprove ? "Recorded" : "Missing"}</p>
            <details><summary className="cursor-pointer">Read evidence</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {([['Entry price',entry.entryPrice],['Exit price',entry.exitPrice],['Quantity',entry.quantity],['Exit time (UTC)',entry.exitTime],['Recorded P&L',entry.recordedPnl],['Plan adherence',isPlanAdherenceGroup(entry.planAdherence) ? PLAN_ADHERENCE_LABELS[entry.planAdherence] : null],['Rationale',entry.rationale],['Notes',entry.notes],['What went well',entry.reviewWentWell],['What to improve',entry.reviewImprove]] as const).map(([label,value])=><div key={label} className="min-w-0"><dt className="text-sm text-muted">{label}</dt><dd className="whitespace-pre-wrap break-words">{value ?? "Not recorded"}</dd></div>)}
            </dl>{entry.truncatedFields.length > 0 && <p className="mt-3 text-sm text-amber-200">Shortened to {EVIDENCE_TEXT_LIMIT} characters: {entry.truncatedFields.map(field=>narrativeLabels[field]).join(", ")}. Open the trade for the complete text.</p>}</details>
          </article>)}
        </section>}
      </>}
      <aside className="journal-detail-section space-y-2 text-sm text-muted"><h2>What this evidence cannot establish</h2><p>This is a current journal snapshot, not an AI verdict or a historical audit. Later edits can change it, and existing reviews are not cleared by trade edits. Notes may have been written after the trade.</p><p>No structured pre-trade stop, target or risk plan is captured yet. Missing notes and small samples limit conclusions; complete fields do not prove a trading edge. Text excerpts are limited to {EVIDENCE_TEXT_LIMIT} characters per field.</p></aside>

  </JournalShell>;
}
