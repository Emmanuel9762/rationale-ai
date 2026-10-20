import { JournalShell, JournalHeader } from "@/app/journal-shell";
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
  return <JournalShell active="journal">
      <nav className="journal-tools" aria-label="CSV tools"><Link href="/trades/preview">Preview CSV</Link></nav>
      <JournalHeader eyebrow="Import trades" title="Import history"><p>Your saved CSV batches, newest first. Retrying a batch returns its existing receipt.</p></JournalHeader>
      <p className="text-sm text-muted">Original count records how many trades were saved. Linked trades show their current values, including later edits. Older batches may have no trade links; their original counts remain available. Links are never guessed from dates or matching values.</p>
      {errors.length ? <div role="alert">{errors.join(" ")}</div> : <>
        {!result.imports.length ? <p className="rounded-xl border border-line p-5">{page > 1 ? <>No imports on this page. <Link href={importHistoryHref()} className="underline">Return to the first page</Link>.</> : <>No imports yet. <Link href="/trades/preview" className="underline">Preview a CSV</Link> to get started.</>}</p> :
          <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-sm">
            <thead className="bg-panel text-muted"><tr>{["Imported (UTC)", "Account", "Receipt", "Original count", "Linked trades"].map(label => <th scope="col" key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody>{result.imports.map(batch => <tr key={batch.id} className="border-t border-line">
              <td className="whitespace-nowrap p-4">{batch.createdAt.toISOString()}</td><td className="p-4">{batch.accountName}</td><th scope="row" className="max-w-xs break-all p-4 font-normal">{batch.id}</th><td className="p-4 tabular-nums">{batch.originalCount}</td>
              <td className="p-4">{batch.linkedCount > 0 ? <Link className="underline" href={journalHref({import:batch.id})} aria-label={`View trades for import ${batch.id}`}>View {batch.linkedCount} {batch.linkedCount === 1 ? "trade" : "trades"}</Link> : "Trade links unavailable"}</td>
            </tr>)}</tbody>
          </table></div>}
        <nav aria-label="Import pagination" className="flex gap-5 text-sm">{page > 1 && <Link href={importHistoryHref(page - 1)}>Previous</Link>}<span>Page {page}</span>{result.hasNext && page < 100000 && <Link href={importHistoryHref(page + 1)}>Next</Link>}</nav>
      </>}

  </JournalShell>;
}
