import { EntryDatePresets } from "@/app/entry-date-presets";
import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { journalHref, parseJournalFilters, type JournalSearchParams, type JournalFilters } from "@/lib/journal-filters";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";
import { formatPnl, tradeMetrics } from "@/lib/trade-metrics";

export const dynamic = "force-dynamic";
type Period = Pick<JournalFilters, "from" | "to">;
async function DashboardResults({ userId, period }: { userId: string; period: Period }) {
  const filtered = Boolean(period.from || period.to);
  const [metrics, recent] = await Promise.all([
    tradeMetrics(db, userId, period), tradeRepository(db).list(userId, 1, period),
  ]);
  const followUps = [
    { label: "Open / incomplete trades", count: metrics.open, filters: {status:"open"}, note: "Check entries that are still open or have incomplete exit details." },
    { label: "Closed trades missing P&L", count: metrics.missingPnl, filters: {outcome:"missing"}, note: "These trades are excluded from measured performance until P&L is recorded." },
    { label: "Closed trades awaiting review", count: metrics.awaitingReview, filters: {status:"closed",review:"unreviewed"}, note: "Reflect on the decision while the trade is still fresh." },
  ] satisfies {label:string;count:number;filters:JournalFilters;note:string}[];
  const stats = [
    { label: "Recorded realized P&L", value: metrics.measured ? formatPnl(metrics.pnl) : "—", note: "Account currency" },
    { label: "Win rate", value: metrics.winRate, note: "Wins / closed trades with P&L" },
    { label: "Profit factor", value: metrics.profitFactor, note: "Gross profits / gross losses" },
    { label: "Trades", value: String(metrics.total), note: `${metrics.closed} closed · ${metrics.open} open / incomplete` },
  ];
  return <div className="space-y-6">
      <p className="text-sm text-zinc-400"><Link className="underline" href={journalHref({...period,status:"closed",review:"unreviewed"})}>Review closed trades</Link> in this period.</p>
      <section aria-label="Trading metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(stat => <div key={stat.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><h2 className="text-sm text-zinc-400">{stat.label}</h2><p className="mt-2 break-words text-2xl font-semibold">{stat.value}</p><p className="mt-2 text-xs text-zinc-400">{stat.note}</p></div>)}</section>
      <section aria-labelledby="follow-up-heading" className="space-y-3">
        <h2 id="follow-up-heading" className="font-medium">Journal follow-up</h2>
        <p className="text-sm text-zinc-400">All accounts, selected entry dates. A trade can need both P&amp;L and a review, so these counts overlap. Open trades may simply still be active.</p>
        <div className="grid gap-4 md:grid-cols-3">{followUps.map(item => <Link key={item.label} href={journalHref({...period,...item.filters})} aria-label={`${item.label}: ${item.count}`} className="rounded-xl border border-zinc-800 p-5 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-100">
          <h3 className="text-sm underline">{item.label}</h3><p className="mt-2 text-2xl font-semibold tabular-nums">{item.count}</p><p className="mt-2 text-sm text-zinc-400">{item.note}</p>
        </Link>)}</div>
        {followUps.every(item => item.count === 0) && <p className="text-sm text-zinc-400">{metrics.total === 0 ? filtered ? "No trades match these entry dates. Change the dates or choose All time." : "Log or import trades to build your journal." : "No trades in these follow-up queues. This does not assess the quality of your trading."}</p>}
      </section>
      <section className="rounded-xl border border-zinc-800 p-5"><h2 className="font-medium">What these numbers include</h2><p className="mt-2 text-sm text-zinc-400">{metrics.measured} closed trades have recorded P&L. {metrics.missingPnl} closed trades still need P&L. Open or incomplete trades are excluded from performance metrics. Break-even trades count in win rate. All P&L entries must use the same account currency; no currency conversion is applied. ∞ means recorded profits with no recorded losses.</p></section>
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><div className="flex items-center justify-between"><h2 className="font-medium">Recent trades</h2><Link href={journalHref(period)} className="text-sm underline">View all matching trades</Link></div>
        {!recent.trades.length ? <p className="mt-4 text-zinc-400">{filtered ? "No trades match these entry dates." : "Your journal is empty. Log your first trade to start reviewing your decisions."}</p> : <ul className="mt-4 divide-y divide-zinc-800">{recent.trades.slice(0, 5).map(trade => <li key={trade.id}><Link className="flex flex-wrap justify-between gap-3 py-4" href={`/trades/${trade.id}`}><span>{trade.symbol} <span className="text-sm text-zinc-400">{trade.direction}</span></span><span className="text-sm text-zinc-400">{trade.entryTime.toISOString().slice(0, 10)} · {trade.exitTime && trade.exitPrice !== null ? "Closed" : "Open / incomplete"}</span></Link></li>)}</ul>}
      </section>
  </div>;
}


export default async function Home({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const { filters: period, errors } = parseJournalFilters({from:params.from,to:params.to});
  const filtered = Boolean(period.from || period.to);
  return <main className="min-h-screen bg-zinc-950 text-zinc-100">
    <header className="border-b border-zinc-800 px-6 py-5"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-zinc-400">RationaleAI</p><h1 className="text-xl font-semibold">Trading dashboard</h1></div><nav className="flex flex-wrap items-center gap-5 text-sm"><Link href="/account">Account</Link><Link href="/trades">Trade history</Link><Link href="/performance">Performance</Link><Link href="/trades/new" className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-950">Log trade</Link></nav></div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <p className="text-sm text-zinc-400">Your journal · {errors.length ? "Check entry dates" : filtered ? `${period.from ?? "Beginning"} through ${period.to ?? "no end limit"} (UTC entry dates)` : "All time"}</p>
      <form action="/" method="get" key={`${period.from}:${period.to}`} aria-label="Dashboard dates" className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-800 p-5">
        {([['from','From entry date (UTC)'],['to','Through entry date (UTC)']] as const).map(([name,label]) => <div key={name}><label htmlFor={name} className="block text-sm">{label}</label><input id={name} name={name} type="date" defaultValue={typeof params[name] === "string" ? params[name] : ""} className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2" /></div>)}
        <button className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-950">Apply dates</button><Link className="underline" href="/">All time</Link>
        {!errors.length && <><Link className="underline" href={journalHref(period).replace('/trades','/performance')}>View performance for these dates</Link><Link className="underline" href={journalHref(period).replace('/trades','/review-evidence')}>Review evidence for these dates</Link></>}
      </form>
      <EntryDatePresets pathname="/" period={errors.length ? {} : period} />
      <p className="text-sm text-zinc-400">Dates select when trades were entered, even if they closed later. Both UTC boundary days are included. Blank dates are unrestricted; other journal filters do not apply here.</p>
      {errors.length ? <div role="alert" className="rounded-xl border border-red-900 p-5"><p>Check your dates.</p><ul>{errors.map(error=><li key={error}>{error}</li>)}</ul></div> : <DashboardResults userId={user.id} period={period} />}
    </div>
  </main>;
}
