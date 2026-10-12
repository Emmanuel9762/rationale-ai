import Link from "next/link";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { importHistory, importHistoryHref } from "@/lib/import-history";
import { journalHref, parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";

export const dynamic = "force-dynamic";

export default async function ImportHistoryPage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const { page, errors } = parseJournalFilters({ page: params.page });
  const result = errors.length ? { imports: [], hasNext: false } : await importHistory(db, user.id, page);
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex gap-5 text-sm"><Link href="/trades">Trade history</Link><Link href="/trades/preview">Preview CSV</Link></nav>
      <header><h1 className="text-2xl font-semibold">Import history</h1><p className="mt-2 text-zinc-400">Your saved CSV batches, newest first. Retrying a batch returns its existing receipt.</p></header>
      <p className="text-sm text-zinc-400">Original count records how many trades were saved. Linked trades show their current values, including later edits. Older batches may have no trade links; their original counts remain available. Links are never guessed from dates or matching values.</p>
      {errors.length ? <div role="alert">{errors.join(" ")}</div> : <>
        {!result.imports.length ? <p className="rounded-xl border border-zinc-800 p-5">{page > 1 ? <>No imports on this page. <Link href={importHistoryHref()} className="underline">Return to the first page</Link>.</> : <>No imports yet. <Link href="/trades/preview" className="underline">Preview a CSV</Link> to get started.</>}</p> :
          <div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400"><tr>{["Imported (UTC)", "Account", "Receipt", "Original count", "Linked trades"].map(label => <th scope="col" key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody>{result.imports.map(batch => <tr key={batch.id} className="border-t border-zinc-800">
              <td className="whitespace-nowrap p-4">{batch.createdAt.toISOString()}</td><td className="p-4">{batch.accountName}</td><th scope="row" className="max-w-xs break-all p-4 font-normal">{batch.id}</th><td className="p-4 tabular-nums">{batch.originalCount}</td>
              <td className="p-4">{batch.linkedCount > 0 ? <Link className="underline" href={journalHref({import:batch.id})} aria-label={`View trades for import ${batch.id}`}>View {batch.linkedCount} {batch.linkedCount === 1 ? "trade" : "trades"}</Link> : "Trade links unavailable"}</td>
            </tr>)}</tbody>
          </table></div>}
        <nav aria-label="Import pagination" className="flex gap-5 text-sm">{page > 1 && <Link href={importHistoryHref(page - 1)}>Previous</Link>}<span>Page {page}</span>{result.hasNext && page < 100000 && <Link href={importHistoryHref(page + 1)}>Next</Link>}</nav>
      </>}
    </div>
  </main>;
}
