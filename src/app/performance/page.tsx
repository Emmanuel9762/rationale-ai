import Link from "next/link";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { formatPnl, tradeBreakdown } from "@/lib/trade-metrics";

export const dynamic = "force-dynamic";
type Breakdown = Awaited<ReturnType<typeof tradeBreakdown>>;

function BreakdownTable({ title, dimension, rows }: { title: string; dimension: string; rows: Breakdown }) {
  return <section className="space-y-3" aria-label={title}>
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{title}: all-time recorded results</caption>
        <thead className="bg-zinc-900 text-zinc-400"><tr>
          {[dimension, "Total trades", "Open / incomplete", "Closed without P&L", "Closed with P&L (sample)", "Win rate", "Recorded P&L"].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.group === null ? "missing" : `group:${row.group}`} className="border-t border-zinc-800">
          <th scope="row" className="max-w-xs break-words p-4 font-medium">{row.group ?? <span className="italic text-zinc-400">Not specified</span>}</th>
          <td className="p-4 tabular-nums">{row.total}</td>
          <td className="p-4 tabular-nums">{row.open}</td>
          <td className="p-4 tabular-nums">{row.missingPnl}</td>
          <td className="p-4 font-semibold tabular-nums">{row.measured}</td>
          <td className="whitespace-nowrap p-4 tabular-nums">{row.winRate}</td>
          <td className="whitespace-nowrap p-4 tabular-nums">{row.measured ? formatPnl(row.pnl) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export default async function PerformancePage() {
  const user = await requireCurrentUser();
  const [bySetup, bySymbol] = await Promise.all([
    tradeBreakdown(db, user.id, "setup"),
    tradeBreakdown(db, user.id, "symbol"),
  ]);
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex flex-wrap gap-5 text-sm"><Link href="/account">Account</Link><Link href="/">Dashboard</Link><Link href="/trades">Trade history</Link><Link href="/trades/new">Log a trade</Link></nav>
      <header><h1 className="text-2xl font-semibold">Performance breakdowns</h1><p className="mt-2 text-zinc-400">Your journal · All time · All accounts</p></header>
      <div className="space-y-2 rounded-xl border border-zinc-800 p-5 text-sm text-zinc-300">
        <p>Win rate is wins divided by closed trades with recorded P&L. Break-even trades count in the sample but are not wins. A closed trade has both an exit price and exit time.</p>
        <p>Open / incomplete trades and closed trades missing P&L are excluded from win rate and recorded P&L. A dash means there are no measured results.</p>
        <p>Compare sample sizes before drawing conclusions: a few wins do not establish a reliable pattern. Groups are listed alphabetically, not ranked.</p>
        <p>P&L is shown as recorded, with no currency conversion. All included accounts must use the same currency. These tables cover the whole journal, independently of history filters.</p>
        <p>Setup labels are trimmed but keep their capitalization. Symbols are grouped without regard to case; missing labels appear as <em>Not specified</em>.</p>
      </div>
      {bySetup.length === 0 ? <p className="rounded-xl border border-zinc-800 p-6">No trades yet. <Link className="underline" href="/trades/new">Log a trade</Link> to start building your performance history.</p> : <>
        <BreakdownTable title="By setup" dimension="Setup" rows={bySetup}/>
        <BreakdownTable title="By symbol" dimension="Symbol" rows={bySymbol}/>
      </>}
    </div>
  </main>;
}
