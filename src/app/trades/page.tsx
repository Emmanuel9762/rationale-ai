import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";

import { parseJournalFilters, journalHref, type JournalSearchParams } from "@/lib/journal-filters";

export const dynamic = "force-dynamic";

export default async function TradesPage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const { filters, page, errors } = parseJournalFilters(await searchParams);
  const result = errors.length ? { trades: [], hasNext: false } : await tradeRepository(db).list(user.id, page, filters);
  const active = Object.keys(filters).length > 0;
  const field = "mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 p-2";
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="flex flex-wrap gap-5 text-sm"><Link href="/account">Account</Link><Link href="/">Dashboard</Link><Link href="/performance">Performance</Link><Link href="/trades/new">Log a trade</Link></nav>
      <header><h1 className="text-2xl font-semibold">Trade history</h1><p className="mt-2 text-zinc-400">Your saved entries and the reasoning behind them.</p></header>
      <p className="text-sm text-zinc-400"><Link className="underline" href={journalHref({status:"closed",review:"unreviewed"})}>Needs review</Link>: closed trades without a saved review. Reviewed means a reflection has been saved; later trade edits do not clear it.</p>
      <form action="/trades" method="get" key={journalHref(filters)} className="grid gap-4 rounded-xl border border-zinc-800 p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Journal filters">
        <label>Symbol (exact)<input className={field} name="symbol" defaultValue={filters.symbol ?? ""} maxLength={20} placeholder="e.g. EURUSD" /></label>
        <label>Direction<select className={field} name="direction" defaultValue={filters.direction ?? ""}><option value="">All directions</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
        <label>Status<select className={field} name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="open">Open / incomplete</option><option value="closed">Closed</option></select></label>
        <label>Review<select className={field} name="review" defaultValue={filters.review ?? ""}><option value="">All reviews</option><option value="reviewed">Reviewed</option><option value="unreviewed">Unreviewed</option></select></label>
        <label>Entry from (UTC)<input className={field} name="from" type="date" defaultValue={filters.from ?? ""} /></label>
        <label>Entry through (UTC)<input className={field} name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-5"><button className="rounded bg-zinc-100 px-4 py-2 text-zinc-950">Apply filters</button><Link className="underline" href="/trades">Clear filters</Link></div>
      </form>
      {errors.length > 0 ? <div role="alert" className="rounded-xl border border-red-900 p-4 text-red-300"><p>Check your filters:</p><ul className="list-inside list-disc">{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : <>
      {!result.trades.length ? <p className="rounded-xl border border-zinc-800 p-6">{page > 1 ? <>No trades on this page. <Link className="underline" href={journalHref(filters)}>Return to the first page</Link>.</> : active ? <>No trades match these filters. <Link className="underline" href="/trades">Clear filters</Link> to see your journal.</> : <>No trades yet. <Link className="underline" href="/trades/new">Log a trade</Link> to start your journal.</>}</p> : <div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-zinc-400"><tr>{["Symbol", "Direction", "Entry time (UTC)", "Status", "Recorded P&L", "Review"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead>
        <tbody>{result.trades.map(trade => <tr key={trade.id} className="border-t border-zinc-800"><td className="p-4"><Link className="font-medium underline" href={`/trades/${trade.id}`}>{trade.symbol}</Link></td><td className="p-4">{trade.direction}</td><td className="whitespace-nowrap p-4">{trade.entryTime.toISOString().slice(0, 16).replace("T", " ")}</td><td className="p-4">{trade.exitTime && trade.exitPrice !== null ? "Closed" : "Open / incomplete"}</td><td className="p-4">{trade.pnl ?? "Not recorded"}</td><td className="p-4"><Link className="underline" href={`/trades/${trade.id}#review`}>{trade.reviewedAt ? "Reviewed" : "Unreviewed"}</Link></td></tr>)}</tbody>
      </table></div>}
      <nav className="flex gap-5 text-sm" aria-label="Pagination">{page > 1 && <Link href={journalHref(filters, page - 1)}>Previous</Link>}<span>Page {page}</span>{result.hasNext && page < 100000 && <Link href={journalHref(filters, page + 1)}>Next</Link>}</nav>
      </>}
    </div>
  </main>;
}
