import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { tradeContextHref } from "@/lib/journal-navigation";
import { db } from "@/db";
import { EXPORT_LIMIT, tradeRepository } from "@/lib/trade-repository";
import { OUTCOME_LABELS } from "@/lib/outcome-labels";
import { PLAN_ADHERENCE_LABELS } from "@/lib/plan-adherence";

import { parseJournalFilters, journalHref, type JournalFilters, type JournalSearchParams } from "@/lib/journal-filters";

export const dynamic = "force-dynamic";

export default async function TradesPage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const { filters, page, errors } = parseJournalFilters(await searchParams);
  const repository = tradeRepository(db);
  const [result, total] = errors.length ? [{ trades: [], hasNext: false }, 0] : await Promise.all([
    repository.list(user.id, page, filters), repository.count(user.id, filters),
  ]);
  const active = Object.keys(filters).length > 0;
  const field = "journal-field";
  const filterNames: Record<keyof JournalFilters, string> = {symbol:"Symbol",setup:"Setup",missing:"Missing label",direction:"Direction",status:"Status",outcome:"Outcome",review:"Review",adherence:"Plan adherence",from:"From",to:"Through",import:"Import batch"};
  const filterValue = (key: keyof JournalFilters, value: string) => key === "outcome" ? OUTCOME_LABELS[value as keyof typeof OUTCOME_LABELS] : key === "adherence" ? PLAN_ADHERENCE_LABELS[value as keyof typeof PLAN_ADHERENCE_LABELS] : value;

  return <main className="journal-shell min-h-screen text-zinc-100">
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="journal-nav" aria-label="Main navigation"><Link className="journal-brand" href="/">Rationale<span>AI</span></Link><div className="flex flex-wrap gap-5"><Link href="/">Dashboard</Link><Link href="/trades" aria-current="page">Journal</Link><Link href="/performance">Performance</Link><Link href="/review-evidence">Review evidence</Link><Link href="/account">Account</Link></div></nav>
      <header className="journal-heading"><div><p className="journal-eyebrow">Observe. Reflect. Improve.</p><h1>Trade history</h1><p className="mt-2 text-zinc-400">Your decisions, execution and reflections in one place.</p></div><Link className="journal-primary" href="/trades/new">Log a trade <span aria-hidden="true">↗</span></Link></header>
      <div className="journal-tools"><Link className="journal-review-link" href={journalHref({status:"closed",review:"unreviewed"})}>Needs review <span aria-hidden="true">→</span></Link><span className="text-sm text-zinc-400">Closed trades waiting for reflection</span><div className="flex flex-wrap gap-4 sm:ml-auto"><Link href="/trades/preview">Preview CSV</Link><Link href="/trades/imports">Import history</Link></div></div>
      <details className="journal-filter-panel" open={active || errors.length > 0}><summary>Filters <span>{active ? Object.keys(filters).length + " active" : "Symbol, outcome, review & dates"}</span></summary>
      <form action="/trades" method="get" key={journalHref(filters)} className="journal-filters" aria-label="Journal filters">
        <div className="journal-section-heading"><h2>Find your trades</h2><span>Combine filters to narrow the journal</span></div>
        {filters.import && <div className="mx-5 mt-4"><label>Import batch<input className={field} name="import" value={filters.import} readOnly /></label><p className="text-sm text-zinc-400">Only linked trades from this batch are shown. Older batches may have no links. <Link href="/trades/imports" className="underline">Import history</Link> shows original counts.</p></div>}
        <fieldset className="journal-filter-group"><legend>01 · Trade</legend><div className="journal-filter-grid">
        <label>Symbol (exact)<input className={field} name="symbol" defaultValue={filters.symbol ?? ""} maxLength={20} placeholder="e.g. EURUSD" /></label>
        <label>Setup (exact, case-sensitive)<input className={field} name="setup" defaultValue={filters.setup ?? ""} maxLength={100} placeholder="e.g. Breakout" /></label>
        <label>Missing label<select className={field} name="missing" defaultValue={filters.missing ?? ""}><option value="">No missing-label filter</option><option value="setup">Setup not specified</option><option value="symbol">Symbol not specified</option></select></label>
        <label>Direction<select className={field} name="direction" defaultValue={filters.direction ?? ""}><option value="">All directions</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
        </div></fieldset>
        <fieldset className="journal-filter-group"><legend>02 · Outcome & reflection</legend><div className="journal-filter-grid">
        <label>Status<select className={field} name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="open">Open / incomplete</option><option value="closed">Closed</option></select></label>
        <label htmlFor="outcome">Recorded outcome<select id="outcome" aria-label="Recorded outcome" className={field} name="outcome" defaultValue={filters.outcome ?? ""}><option value="">All outcomes</option>{Object.entries(OUTCOME_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Review<select className={field} name="review" defaultValue={filters.review ?? ""}><option value="">All reviews</option><option value="reviewed">Reviewed</option><option value="unreviewed">Unreviewed</option></select></label>
        <label>Plan adherence<select className={field} name="adherence" defaultValue={filters.adherence ?? ""}><option value="">All assessments</option>{Object.entries(PLAN_ADHERENCE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        </div></fieldset>
        <fieldset className="journal-filter-group"><legend>03 · Entry dates · UTC</legend><div className="journal-date-grid">
        <label>Entry from (UTC)<input className={field} name="from" type="date" defaultValue={filters.from ?? ""} /></label>
        <label>Entry through (UTC)<input className={field} name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        </div></fieldset>
        <div className="journal-filter-actions"><button className="journal-primary">Apply filters</button><Link className="underline" href="/trades">Clear filters</Link></div>
      </form></details>
      {active && <nav aria-label="Active filters" className="flex flex-wrap gap-2">{Object.entries(filters).map(([key,value]) => {
        const remaining = {...filters}; delete remaining[key as keyof JournalFilters];
        const label = filterNames[key as keyof JournalFilters];
        return <Link key={key} className="journal-chip" href={journalHref(remaining)} aria-label={`Remove ${label} filter`}>{label}: <span className="max-w-64 truncate">{filterValue(key as keyof JournalFilters,value)}</span><span aria-hidden="true">×</span></Link>;
      })}</nav>}
      <details className="journal-guide"><summary>How to read this journal</summary><div className="space-y-2">
        <p>Outcome filters use closed trades only (both exit price and exit time). Wins, losses and break-even use the sign of recorded P&amp;L; missing P&amp;L is separate. A recorded amount on an open trade is not a measured closed outcome.</p>
        <p>Reviewed means a reflection has been saved; later trade edits do not clear it. Dates select UTC entry days, including both boundaries.</p>
        <p>CSV exports include all matching pages, up to {EXPORT_LIMIT} trades, with notes, reviews and UTC times. Amounts use recorded account currency; no conversion. Formula-like text gets a protective apostrophe. CSV is not a database backup.</p>
      </div></details>
      {errors.length > 0 ? <div role="alert" className="rounded-xl border border-red-900 p-4 text-red-300"><p>Check your filters:</p><ul className="list-inside list-disc">{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : <>
      <div className="journal-results-heading"><div><h2>Entries</h2><p role="status" aria-label="Journal result count" className="text-sm text-zinc-400">{`${total} matching ${total === 1 ? "trade" : "trades"} · ${result.trades.length} on this page.`}</p></div><a className="journal-secondary" href={journalHref(filters).replace("/trades", "/trades/export")}>Export matching trades (CSV)</a></div>
      {!result.trades.length ? <p className="rounded-xl border border-zinc-800 p-6">{page > 1 ? <>No trades on this page. <Link className="underline" href={journalHref(filters)}>Return to the first page</Link>.</> : active ? <>No trades match these filters. <Link className="underline" href="/trades">Clear filters</Link> to see your journal.</> : <>No trades yet. <Link className="underline" href="/trades/new">Log a trade</Link> to start your journal.</>}</p> : <div className="journal-table-wrap"><table className="journal-table w-full text-left text-sm"><caption className="sr-only">Matching journal entries, newest entry first</caption>
        <thead className="bg-zinc-900 text-zinc-400"><tr>{["Symbol", "Direction", "Entry time (UTC)", "Status", "Recorded P&L", "Review"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead>
        <tbody>{result.trades.map(trade => {
          const closed = Boolean(trade.exitTime && trade.exitPrice !== null);
          const tone = !closed || trade.pnl === null ? "" : Number(trade.pnl) > 0 ? "positive" : Number(trade.pnl) < 0 ? "negative" : "";
          return <tr key={trade.id}>
            <td data-label="Symbol"><Link className="journal-symbol" href={tradeContextHref(trade.id, journalHref(filters, page))}>{trade.symbol}</Link><span className="journal-setup">{trade.setup?.trim() || "No setup recorded"}</span></td>
            <td data-label="Direction"><span className="journal-badge">{trade.direction}</span></td>
            <td data-label="Entry (UTC)" className="whitespace-nowrap"><span>{trade.entryTime.toISOString().slice(0,10)}</span><span className="journal-setup">{trade.entryTime.toISOString().slice(11,16)} UTC</span></td>
            <td data-label="Status"><span className={`journal-badge ${closed ? "" : "pending"}`}>{closed ? "Closed" : "Open / incomplete"}</span></td>
            <td data-label="Recorded P&L" className={`journal-pnl ${tone}`}>{trade.pnl ?? "Not recorded"}{!closed && trade.pnl !== null && <span className="journal-setup">Open trade</span>}</td>
            <td data-label="Review"><Link className={`journal-review-status ${trade.reviewedAt ? "reviewed" : ""}`} href={`${tradeContextHref(trade.id, journalHref(filters, page))}#review`}>{trade.reviewedAt ? "Reviewed" : "Unreviewed"}</Link></td>
          </tr>;
        })}</tbody>
      </table></div>}
      <nav className="journal-pagination" aria-label="Pagination">{page > 1 && <Link href={journalHref(filters, page - 1)}>Previous</Link>}<span>Page {page}</span>{result.hasNext && page < 100000 && <Link href={journalHref(filters, page + 1)}>Next</Link>}</nav>
      </>}
    </div>
  </main>;
}
