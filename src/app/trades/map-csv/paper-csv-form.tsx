"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CSV_MAX_BYTES, CSV_REQUIRED_COLUMNS } from "@/lib/trade-csv-preview";
import { inspectPaperCsv, mapPaperCsv, PAPER_FIELDS, PAPER_LABELS, type PaperMapping } from "@/lib/paper-csv";

import { PRESET_MAX_BYTES, readMappingPreset, writeMappingPreset } from "@/lib/paper-mapping-preset";

export default function PaperCsvForm() {
  const generation = useRef(0);
  const [source,setSource] = useState("");
  const [headers,setHeaders] = useState<string[]>([]);
  const [mapping,setMapping] = useState<PaperMapping>({});
  const [direction,setDirection] = useState<"long-short" | "buy-sell">("long-short");
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [result,setResult] = useState<ReturnType<typeof mapPaperCsv> | null>(null);
  function invalidate() { setResult(null); setError(""); }
  function clear() { generation.current++; setSource(""); setHeaders([]); setMapping({}); setDirection("long-short"); setConfirmed(false); setBusy(false); invalidate(); }
  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("paperCsv");
    clear(); const current = generation.current; setBusy(true);
    try {
      if (!(file instanceof File) || !file.size) throw new Error("Choose a non-empty CSV file.");
      if (file.size > CSV_MAX_BYTES) throw new Error("Use a CSV no larger than 256 KiB.");
      const text = new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
      const parsed = inspectPaperCsv(text);
      if(current !== generation.current) return;
      setSource(text); setHeaders(parsed.headers);
      setMapping(Object.fromEntries(PAPER_FIELDS.filter(field=>parsed.headers.includes(field)).map(field=>[field,parsed.headers.indexOf(field)])));
    } catch(e) { if(current===generation.current) setError(e instanceof TypeError ? "Use a UTF-8 text CSV." : e instanceof Error ? e.message : "Could not read CSV."); }
    finally { if(current===generation.current) setBusy(false); }
  }
  async function loadPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const current = ++generation.current;
    invalidate(); setConfirmed(false); setBusy(true);
    try {
      if (file.size > PRESET_MAX_BYTES) throw new Error("Mapping files must be no larger than 16 KiB.");
      const text = new TextDecoder("utf-8", {fatal:true}).decode(await file.arrayBuffer());
      const preset = readMappingPreset(text, headers);
      if (current !== generation.current) return;
      setMapping(preset.mapping); setDirection(preset.direction);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "Could not load mapping.");
    } finally { if (current === generation.current) setBusy(false); }
  }
  function downloadText(text: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const link = document.createElement("a"); link.href=url; link.download=filename; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function savePreset() {
    try { downloadText(writeMappingPreset(headers,mapping,direction), "rationale-mapping.json", "application/json"); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not save mapping."); }
  }
  function preview(event: FormEvent) {
    event.preventDefault(); invalidate();
    try { setResult(mapPaperCsv(source,mapping,direction,confirmed)); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not map this file."); }
  }
  function download() {
    if(!result || result.preview.errors.length) return;
    downloadText(result.csv,"rationale-paper-trades.csv","text/csv;charset=utf-8");
  }
  return <div className="space-y-6">
    <form onSubmit={read} onReset={clear} className="journal-detail-section space-y-4">
      <h2>1. Read your file</h2>
      <label className="block">Paper-trade CSV<input className="journal-field" type="file" name="paperCsv" accept=".csv,text/csv" required onChange={clear} /></label>
      <p className="text-sm text-zinc-400">UTF-8, comma-separated, up to 256 KiB, 500 records and 32 columns. Quoted commas and multiline notes are supported.</p>
      <div className="flex gap-5"><button disabled={busy} className="journal-primary">{busy ? "Reading…" : "Read columns"}</button><button type="reset" className="underline">Clear mapping</button></div>
    </form>
    {!!headers.length && <form onSubmit={preview} className="journal-detail-section space-y-5" aria-label="Paper CSV mapping">
      <h2>2. Match journal fields</h2>
      <details className="space-y-3"><summary>Reuse a mapping</summary>
        <p className="text-sm text-zinc-400">Mapping files contain column names and direction choices only, never trade rows. Loading matches exact names even after columns move. Review the choices and confirm this file again.</p>
        <label className="block text-sm">Mapping JSON<input className="journal-field" type="file" accept=".json,application/json" disabled={busy} onChange={loadPreset} /></label>
        <button type="button" className="underline" disabled={busy} onClick={savePreset}>Download mapping settings</button>
      </details>
      <fieldset disabled={busy} className="space-y-5">
      <p className="text-sm text-zinc-400">Only exact Rationale field names are matched automatically. Review every selection. Unmapped source columns will be omitted.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{PAPER_FIELDS.map(field=><label key={field} className="text-sm">{PAPER_LABELS[field]}{(CSV_REQUIRED_COLUMNS as readonly string[]).includes(field) ? " (required)" : " (optional)"}<select aria-label={PAPER_LABELS[field]} required={(CSV_REQUIRED_COLUMNS as readonly string[]).includes(field)} className="journal-field" value={mapping[field] ?? ""} onChange={event=>{
        const next={...mapping}; if(event.target.value==="") delete next[field]; else next[field]=Number(event.target.value);
        setMapping(next); invalidate();
      }}><option value="">Not mapped</option>{headers.map((header,index)=><option value={index} key={index}>{header}</option>)}</select></label>)}</div>
      <label className="block text-sm">Direction values<select aria-label="Direction values" className="journal-field" value={direction} onChange={event=>{setDirection(event.target.value as typeof direction);invalidate();}}><option value="long-short">LONG / SHORT</option><option value="buy-sell">BUY / SELL (entry side of a whole trade)</option></select></label>
      <p className="text-sm text-zinc-300">Times must already be UTC ISO values, such as 2026-10-01T09:30:00Z. Decimal numbers must use a dot, without currency symbols or thousands separators. Quantity is taken as supplied; no lot-size conversion. No time-zone conversion, fee calculation or P&amp;L calculation is performed.</p>
      <label className="flex gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={event=>{setConfirmed(event.target.checked);invalidate();}} />Each row is one journal trade; quantities are understood and recorded amounts use my account currency.</label>
      <button className="journal-primary">Validate mapping</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="rounded-lg border border-red-900 p-4 text-red-300">{error}</p>}
    {result && <section className="journal-detail-section space-y-4" aria-label="Mapped CSV results">
      <h2>3. Check the result</h2>
      <p role="status">{result.preview.total} records: {result.preview.rows.length} valid, {result.preview.errors.length} invalid, {result.preview.rows.filter(row=>row.duplicateOf!==undefined).length} repeated. No trades saved.</p>
      <p className="break-words text-sm text-zinc-400">Omitted source columns: {result.ignoredHeaders.join(", ") || "none"}. Formula-like text receives a protective apostrophe in the preview and downloaded file.</p>
      {!!result.preview.errors.length && <div role="alert"><p>Fix these source records, then read the corrected file again:</p><ul className="list-inside list-disc text-red-300">{result.preview.errors.map(error=><li key={error.record}>Record {error.record}: {error.message}</li>)}</ul></div>}
      {!!result.preview.rows.length && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left">Validated trades — record numbers refer to the source file.</caption><thead><tr>{["Record","Symbol","Direction","Entry (UTC)","P&L","Details"].map(label=><th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{result.preview.rows.map(row=><tr className="border-t border-zinc-800" key={row.record}><td className="p-2">{row.record}{row.duplicateOf!==undefined && <span className="block text-amber-300">Repeats {row.duplicateOf}</span>}</td><td className="p-2">{row.trade.symbol}</td><td className="p-2">{row.trade.direction}</td><td className="whitespace-nowrap p-2">{row.trade.entryTime.toISOString()}</td><td className="p-2">{row.trade.pnl ?? "Not recorded"}</td><td className="min-w-64 p-2"><details><summary>Details for record {row.record}</summary><dl className="space-y-2">{Object.entries({"Entry price":row.trade.entryPrice,"Quantity":row.trade.quantity,"Exit price":row.trade.exitPrice,"Exit (UTC)":row.trade.exitTime?.toISOString(),"Setup":row.trade.setup,"Rationale":row.trade.rationale,"Notes":row.trade.notes}).map(([label,value])=><div key={label}><dt className="text-zinc-400">{label}</dt><dd className="whitespace-pre-wrap break-words">{value ?? "Not supplied"}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div>}
      {!result.preview.errors.length && <div className="space-y-3"><button className="journal-primary" onClick={download}>Download mapped CSV</button><p className="text-sm">Next: open <Link className="underline" href="/trades/preview">Preview CSV</Link>, choose the downloaded file, check it again, then explicitly confirm import.</p></div>}
      <p className="text-sm text-zinc-400">Repeated rows are retained. This mapper does not compare with your existing journal. Overlapping files or changed row order can create new batches: use a test account and do not reimport overlapping history.</p>
    </section>}
  </div>;
}
