import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { db } from "@/db";
import { tradeRepository } from "@/lib/trade-repository";

export const dynamic = "force-dynamic";

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireCurrentUser();
  const raw = (await searchParams).page ?? "1";
  const page = /^\d+$/.test(raw) ? Math.min(100000, Math.max(1, Number(raw))) : 1;
  const result = await tradeRepository(db).list(user.id, page);
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="flex gap-5 text-sm"><Link href="/account">Account</Link><Link href="/">Dashboard</Link><Link href="/trades/new">Log a trade</Link></nav>
      <header><h1 className="text-2xl font-semibold">Trade history</h1><p className="mt-2 text-zinc-400">Your saved entries and the reasoning behind them.</p></header>
      {!result.trades.length ? <p className="rounded-xl border border-zinc-800 p-6">No trades on this page. <Link className="underline" href="/trades/new">Log a trade</Link> to start your journal.</p> : <div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-zinc-400"><tr>{["Symbol", "Direction", "Entry time (UTC)", "Status", "Recorded P&L"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead>
        <tbody>{result.trades.map(trade => <tr key={trade.id} className="border-t border-zinc-800"><td className="p-4"><Link className="font-medium underline" href={`/trades/${trade.id}`}>{trade.symbol}</Link></td><td className="p-4">{trade.direction}</td><td className="whitespace-nowrap p-4">{trade.entryTime.toISOString().slice(0, 16).replace("T", " ")}</td><td className="p-4">{trade.exitTime && trade.exitPrice !== null ? "Closed" : "Open / incomplete"}</td><td className="p-4">{trade.pnl ?? "Not recorded"}</td></tr>)}</tbody>
      </table></div>}
      <nav className="flex gap-5 text-sm" aria-label="Pagination">{page > 1 && <Link href={`/trades?page=${page - 1}`}>Previous</Link>}<span>Page {page}</span>{result.hasNext && <Link href={`/trades?page=${page + 1}`}>Next</Link>}</nav>
    </div>
  </main>;
}
