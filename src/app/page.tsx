import Link from "next/link";
import { db } from "@/db";
import { DEVELOPMENT_EMAIL, tradeRepository } from "@/lib/trade-repository";
import { formatPnl, tradeMetrics } from "@/lib/trade-metrics";

export const dynamic = "force-dynamic";
export default async function Home() {
  const [metrics, recent] = await Promise.all([
    tradeMetrics(db, DEVELOPMENT_EMAIL), tradeRepository(db).list(DEVELOPMENT_EMAIL),
  ]);
  const stats = [
    { label: "Recorded realized P&L", value: metrics.measured ? formatPnl(metrics.pnl) : "—", note: "Account currency" },
    { label: "Win rate", value: metrics.winRate, note: "Wins / closed trades with P&L" },
    { label: "Profit factor", value: metrics.profitFactor, note: "Gross profits / gross losses" },
    { label: "Trades", value: String(metrics.total), note: `${metrics.closed} closed · ${metrics.open} open / incomplete` },
  ];
  return <main className="min-h-screen bg-zinc-950 text-zinc-100">
    <header className="border-b border-zinc-800 px-6 py-5"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-zinc-400">RationaleAI</p><h1 className="text-xl font-semibold">Trading dashboard</h1></div><nav className="flex items-center gap-5 text-sm"><Link href="/trades">Trade history</Link><Link href="/trades/new" className="rounded-lg bg-zinc-100 px-4 py-2 font-medium text-zinc-950">Log trade</Link></nav></div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <p className="text-sm text-zinc-400">Development journal · All time · Single user</p>
      <section aria-label="Trading metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(stat => <div key={stat.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><h2 className="text-sm text-zinc-400">{stat.label}</h2><p className="mt-2 break-words text-2xl font-semibold">{stat.value}</p><p className="mt-2 text-xs text-zinc-400">{stat.note}</p></div>)}</section>
      <section className="rounded-xl border border-zinc-800 p-5"><h2 className="font-medium">What these numbers include</h2><p className="mt-2 text-sm text-zinc-400">{metrics.measured} closed trades have recorded P&L. {metrics.missingPnl} closed trades still need P&L. Open or incomplete trades are excluded from performance metrics. Break-even trades count in win rate. All P&L entries must use the same account currency; no currency conversion is applied. ∞ means recorded profits with no recorded losses.</p></section>
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><div className="flex items-center justify-between"><h2 className="font-medium">Recent trades</h2><Link href="/trades" className="text-sm underline">View all</Link></div>
        {!recent.trades.length ? <p className="mt-4 text-zinc-400">Your journal is empty. Log your first trade to start reviewing your decisions.</p> : <ul className="mt-4 divide-y divide-zinc-800">{recent.trades.slice(0, 5).map(trade => <li key={trade.id}><Link className="flex flex-wrap justify-between gap-3 py-4" href={`/trades/${trade.id}`}><span>{trade.symbol} <span className="text-sm text-zinc-400">{trade.direction}</span></span><span className="text-sm text-zinc-400">{trade.entryTime.toISOString().slice(0, 10)} · {trade.exitTime && trade.exitPrice !== null ? "Closed" : "Open / incomplete"}</span></Link></li>)}</ul>}
      </section>
    </div>
  </main>;
}
