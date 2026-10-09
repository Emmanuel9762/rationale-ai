"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, CSV_REQUIRED_COLUMNS, CSV_OPTIONAL_COLUMNS, previewTradeCsv, type CsvPreview } from "@/lib/trade-csv-preview";
import { importTradeCsv } from "./actions";
import type { ImportState } from "@/lib/trade-import";
import { PLAN_ADHERENCE_LABELS } from "@/lib/plan-adherence";

export default function CsvPreviewForm() {
  const [result, setResult] = useState<CsvPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [source, setSource] = useState("");
  const [importState, setImportState] = useState<ImportState>({});
  const [isImporting, startImport] = useTransition();
  const generation = useRef(0);
  function clear() { generation.current++; setResult(null); setError(""); setPending(false); setSource(""); setImportState({}); }
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = ++generation.current;
    setResult(null); setError(""); setPending(true); setSource(""); setImportState({});
    try {
      const file = new FormData(event.currentTarget).get("csv");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose a non-empty CSV file.");
      if (file.size > CSV_MAX_BYTES) throw new Error("Use a CSV no larger than 256 KiB.");
      const source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const parsed = previewTradeCsv(source);
      if (generation.current === current) { setResult(parsed); setSource(source); }
    } catch (error) {
      if (generation.current === current) setError(error instanceof TypeError ? "Use a UTF-8 text CSV." : error instanceof Error ? error.message : "Could not read this file.");
    } finally { if (generation.current === current) setPending(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isImporting) return;
    const data = new FormData(event.currentTarget);
    data.set("csv", source);
    startImport(async () => {
      try { setImportState(await importTradeCsv(data)); }
      catch { setImportState({error: "Could not confirm the import. Retry the same file unchanged to recover its receipt without adding the batch again."}); }
    });
  }
  return <div className="space-y-6">
    <p className="text-sm text-zinc-300"><a className="underline" href="/samples/rationaleai-mock-trades.csv" download>Download mock trade CSV</a> — 36 synthetic records: expect 30 valid, 6 deliberately invalid and 2 repeated. Records 32–37 test quantity, closing fields, dates, review choice and decimal precision. Remove those six records for a valid-only file.</p>
    <form onSubmit={preview} onReset={clear} className="space-y-4 rounded-xl border border-zinc-800 p-5">
      <label className="block">Trade CSV<input className="mt-2 block w-full rounded border border-zinc-700 p-3" type="file" disabled={isImporting} name="csv" accept=".csv,text/csv" required onChange={clear} aria-describedby="csv-limits" /></label>
      <p id="csv-limits" className="text-sm text-zinc-400">UTF-8, comma-separated, up to 256 KiB and {CSV_MAX_ROWS} trades. Preview reads the file in this browser. Only confirming an import sends its contents to the server. JavaScript is required.</p>
      <div className="flex gap-5"><button disabled={pending || isImporting} className="rounded bg-zinc-100 px-4 py-2 text-zinc-950 disabled:opacity-50">{pending ? "Reading CSV…" : "Preview CSV"}</button><button type="reset" disabled={isImporting} className="underline">Clear preview</button></div>
    </form>
    <details className="rounded-xl border border-zinc-800 p-5 text-sm">
      <summary className="cursor-pointer font-medium">CSV format and limits</summary>
      <div className="mt-4 space-y-3 text-zinc-300">
        <p>Required headers: <code>{CSV_REQUIRED_COLUMNS.join(", ")}</code>.</p>
        <p>Optional headers: <code>{CSV_OPTIONAL_COLUMNS.join(", ")}</code>.</p>
        <p>Use LONG or SHORT and decimal numbers without currency symbols or thousands separators. Timestamps must be UTC, for example 2026-10-01T09:30:00Z or 2026-10-01T09:30:00.123Z. Seconds and milliseconds are preserved.</p>
        <p>For open trades, leave exit price, exit time and P&amp;L blank. For closed trades, provide both exit fields; P&amp;L may be blank. A review needs followed, partly or not_followed plus at least one reflection.</p>
        <p>RationaleAI export headers are accepted. Trade IDs, account IDs, creation times and review times are ignored metadata. Protective apostrophes in exported text are retained. Imported rows get new trade IDs and creation times; reviews are marked reviewed at import time. This is not a backup restore or broker-specific importer.</p>
        <p>Record numbers count the header as record 1; quoted multiline notes remain one record. Only identical normalized trade and review fields are flagged as repeats within this file. Repeats are not removed and may represent separate trades.</p>
      </div>
    </details>
    {pending && <p role="status">Reading CSV…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-900 p-4 text-red-300">{error}</p>}
    {result && <section className="space-y-4" aria-label="CSV results">
      <p role="status">{result.total} records: {result.rows.length} valid, {result.errors.length} invalid, {result.rows.filter(row => row.duplicateOf !== undefined).length} repeated. {importState.receipt ? "Batch confirmed." : importState.error ? "Import not confirmed; retry unchanged." : "No trades saved."}</p>
      <p className="text-sm text-zinc-400">Valid records include {result.rows.filter(row => !row.trade.exitTime).length} open trades, {result.rows.filter(row => row.trade.exitTime && row.trade.pnl === null).length} closed without P&amp;L, and {result.rows.filter(row => row.trade.pnl !== null).length} closed with P&amp;L. Counts include repeats.</p>
      {result.ignoredColumns.length > 0 && <p className="text-sm text-zinc-400">Ignored metadata: {result.ignoredColumns.join(", ")}.</p>}
      {result.errors.length === 0 && !importState.receipt && <form onSubmit={save} key={source} className="space-y-4 rounded-xl border border-zinc-700 p-5" aria-label="Confirm CSV import">
        <h2 className="font-semibold">Save this batch</h2>
        <p className="text-sm text-zinc-300">Save all {result.rows.length} records to your default account. Recorded amounts must use that account’s currency; no conversion is performed. Existing trades and account balances stay unchanged.</p>
        <p className="text-sm text-zinc-400">The same validated batch in the same order returns its original receipt, including after reload or later trade edits. Changing rows or their order creates a different batch. Overlaps with other files or manual trades are not detected.</p>
        <label className="flex gap-3"><input type="checkbox" name="confirmed" value="yes" required disabled={isImporting} />I confirm these trades should be saved to my journal.</label>
        {result.rows.some(row => row.duplicateOf !== undefined) && <label className="flex gap-3"><input type="checkbox" name="allowRepeated" value="yes" required disabled={isImporting} />Repeated records are intentional; save every copy.</label>}
        <button disabled={isImporting} className="rounded bg-zinc-100 px-4 py-2 text-zinc-950 disabled:opacity-50">{isImporting ? "Importing…" : "Confirm import"}</button>
      </form>}
      {importState.error && <p role="alert" className="rounded-xl border border-red-900 p-4 text-red-300">{importState.error}</p>}
      {importState.receipt && <div role="status" className="rounded-xl border border-zinc-700 p-5"><p>Batch confirmed: {importState.receipt.count} {importState.receipt.count === 1 ? "trade" : "trades"}. Replaying this batch will not add it again.</p><p className="mt-2 break-all text-sm text-zinc-400">Receipt: {importState.receipt.id}</p><Link href="/trades" className="mt-3 inline-block underline">View trade history</Link></div>}
      {result.errors.length > 0 && <div role="alert" className="rounded-xl border border-red-900 p-4"><h2 className="font-semibold">Records to fix</h2><ul className="mt-2 list-inside list-disc">{result.errors.map(item => <li key={item.record}>Record {item.record}: {item.message}</li>)}</ul></div>}
      {result.rows.length > 0 && <div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-sm">
        <caption className="p-4 text-left">Valid records — expand Details for prices, notes and reflections.</caption>
        <thead className="bg-zinc-900"><tr>{["Record", "Symbol", "Direction", "Entry (UTC)", "Status", "Recorded P&L", "Plan adherence", "Details"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{result.rows.map(({ record, trade, review, duplicateOf }) => <tr key={record} className="border-t border-zinc-800 align-top">
          <th scope="row" className="p-3">{record}{duplicateOf !== undefined && <span className="block font-normal text-amber-300">Repeats {duplicateOf}</span>}</th>
          <td className="p-3">{trade.symbol}</td><td className="p-3">{trade.direction}</td><td className="whitespace-nowrap p-3">{trade.entryTime.toISOString()}</td><td className="p-3">{trade.exitTime ? "Closed" : "Open"}</td><td className="p-3">{trade.pnl ?? "Not recorded"}</td><td className="p-3">{review ? PLAN_ADHERENCE_LABELS[review.planAdherence] : "Unreviewed"}</td>
          <td className="min-w-64 p-3"><details><summary className="cursor-pointer">Details for record {record}</summary><dl className="mt-2 space-y-2 whitespace-pre-wrap break-words">{Object.entries({ "Entry price": trade.entryPrice, "Quantity": trade.quantity, "Exit price": trade.exitPrice, "Exit (UTC)": trade.exitTime?.toISOString(), "Setup": trade.setup, "Rationale": trade.rationale, "Notes": trade.notes, "Went well": review?.reviewWentWell, "Improve": review?.reviewImprove }).map(([name,value]) => <div key={name}><dt className="text-zinc-400">{name}</dt><dd>{value ?? "Not supplied"}</dd></div>)}</dl></details></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </div>;
}
