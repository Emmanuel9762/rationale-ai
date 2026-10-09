import Link from "next/link";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { formatPnl, tradeBreakdown } from "@/lib/trade-metrics";

import { breakdownJournalHref, journalHref, parseJournalFilters, type JournalFilters, type JournalSearchParams } from "@/lib/journal-filters";

export const dynamic = "force-dynamic";
type Breakdown = Awaited<ReturnType<typeof tradeBreakdown>>;

function BreakdownTable({ title, dimension, rows, by, period }: { title: string; dimension: string; rows: Breakdown; by: "setup" | "symbol"; period: Pick<JournalFilters, "from" | "to"> }) {
  return <section className="space-y-3" aria-label={title}>
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{title}: recorded results for the selected entry dates</caption>
        <thead className="bg-zinc-900 text-zinc-400"><tr>
          {[dimension, "Total trades", "Open / incomplete", "Closed without P&L", "Closed with P&L (sample)", "Win rate", "Recorded P&L", "Average P&L", "Average win", "Average loss", "Profit factor"].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.group === null ? "missing" : `group:${row.group}`} className="border-t border-zinc-800">
          <th scope="row" className="max-w-xs break-words p-4 font-medium"><Link className="underline" href={breakdownJournalHref(by, row.group, period)} aria-label={`View trades for ${by}: ${row.group ?? "Not specified (missing label)"}`}>{row.group ?? <span className="italic text-zinc-400">Not specified</span>}</Link></th>
          <td className="p-4 tabular-nums">{row.total}</td>
          <td className="p-4 tabular-nums">{row.open}</td>
          <td className="p-4 tabular-nums">{row.missingPnl}</td>
          <td className="p-4 font-semibold tabular-nums">{row.measured}</td>
          <td className="whitespace-nowrap p-4 tabular-nums">{row.winRate}</td>
          <td className="whitespace-nowrap p-4 tabular-nums">{row.measured ? formatPnl(row.pnl) : "—"}</td>
          {[row.averagePnl, row.averageWin, row.averageLoss].map((value, index) => <td key={index} className="whitespace-nowrap p-4 tabular-nums">{value === null ? "—" : formatPnl(value)}</td>)}
          <td className="whitespace-nowrap p-4 tabular-nums">{row.profitFactor}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const { filters: period, errors } = parseJournalFilters({ from: params.from, to: params.to });
  const filtered = Boolean(period.from || period.to);
  const [bySetup, bySymbol] = errors.length ? [[], []] : await Promise.all([
    tradeBreakdown(db, user.id, "setup", period),
    tradeBreakdown(db, user.id, "symbol", period),
  ]);
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex flex-wrap gap-5 text-sm"><Link href="/account">Account</Link><Link href="/">Dashboard</Link><Link href="/trades">Trade history</Link><Link href="/trades/new">Log a trade</Link></nav>
      <header><h1 className="text-2xl font-semibold">Performance breakdowns</h1><p className="mt-2 text-zinc-400">Your journal · {filtered ? `${period.from ?? "Beginning"} through ${period.to ?? "no end limit"} (entry dates, UTC)` : "All time"} · All accounts</p></header>
      <form key={`${period.from ?? ""}:${period.to ?? ""}`} action="/performance" method="get" className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-800 p-5">
        {[['from', 'From entry date (UTC)'], ['to', 'Through entry date (UTC)']].map(([name, label]) => <div key={name}>
          <label htmlFor={name} className="block text-sm">{label}</label>
          <input id={name} name={name} type="date" defaultValue={typeof params[name] === "string" ? params[name] : ""} className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2"/>
        </div>)}
        <button className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-950">Apply dates</button>
        <Link className="underline" href="/performance">All time</Link>
        {!errors.length && <Link className="underline" href={journalHref(period)}>View matching trades</Link>}
      </form>
      <div className="space-y-2 rounded-xl border border-zinc-800 p-5 text-sm text-zinc-300">
        <p>Win rate is wins divided by closed trades with recorded P&L. Break-even trades count in the sample but are not wins. A closed trade has both an exit price and exit time.</p>
        <p>Open / incomplete trades and closed trades missing P&L are excluded from performance metrics. Win rate and recorded P&L show a dash when there are no measured results.</p>
        <p>Average P&L is recorded P&L divided by the measured sample, including break-even trades. Average win uses winning trades only; average loss uses losing trades only and shows a positive loss size. A dash means there is no applicable sample. Monetary averages are rounded to two decimal places.</p>
        <p>Profit factor is gross recorded profits divided by gross recorded losses. ∞ means there are recorded profits but no recorded losses; it does not establish a reliable edge. Break-even-only groups show a dash.</p>
        <p>Compare sample sizes before drawing conclusions: a few wins do not establish a reliable pattern. Groups are listed alphabetically, not ranked.</p>
        <p>P&L is shown as recorded, with no currency conversion. All included accounts must use the same currency. Dates include trades entered on the selected UTC days, even if they closed later. Blank bounds are unrestricted. Other history filters do not apply here.</p>
        <p>Setup labels are trimmed but keep their capitalization. Symbols are grouped without regard to case; missing labels appear as <em>Not specified</em>.</p>
        <p>Select a setup or symbol to inspect its trades for these entry dates. The journal includes every trade counted in Total trades, including open trades and missing P&L.</p>
      </div>
      {errors.length ? <div role="alert" className="rounded-xl border border-red-900 p-5"><p>Check your dates.</p><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : filtered && bySetup.length === 0 ? <p>No trades match these entry dates. Change the dates or choose All time.</p> : bySetup.length === 0 ? <p className="rounded-xl border border-zinc-800 p-6">No trades yet. <Link className="underline" href="/trades/new">Log a trade</Link> to start building your performance history.</p> : <>
        <BreakdownTable title="By setup" dimension="Setup" rows={bySetup} by="setup" period={period}/>
        <BreakdownTable title="By symbol" dimension="Symbol" rows={bySymbol} by="symbol" period={period}/>
      </>}
    </div>
  </main>;
}
