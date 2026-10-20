"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ManualReviewState } from "@/lib/manual-review";
import { checkManualReviewAction } from "./manual-actions";

const metricLabels = {
  included: "Included trades", open: "Open / incomplete", measured: "Closed with P&L",
  missingPnl: "Closed without P&L", reviewed: "Marked reviewed", missingRationale: "Missing rationale",
  missingSetup: "Missing setup", missingReviewText: "No review notes",
  truncatedTextFields: "Shortened text fields", recordedPnl: "Recorded P&L",
} as const;
type Period = { from?: string; to?: string };

export default function ManualReviewForm({ period }: { period: Period }) {
  const [state, action, pending] = useActionState<ManualReviewState, FormData>(checkManualReviewAction, { error: "" });
  const [raw, setRaw] = useState(state.raw ?? "");
  const [showFeedback, setShowFeedback] = useState(true);
  const view = showFeedback && !pending && state.raw === raw ? state.view : undefined;
  function clear() { setRaw(""); setShowFeedback(false); }
  const draft = view?.draft;
  const citations = (item: NonNullable<typeof draft>["observations"][number]) => <div className="mt-3 flex flex-wrap gap-2" aria-label="Evidence references">
    {item.tradeIds.map(id => {
      const source = view?.sources.find(source => source.id === id);
      return source && <Link className="journal-chip" href={source.href} key={id}>{source.label}</Link>;
    })}
    {item.metricKeys.map(key => <a key={key} className="journal-chip" href={`#draft-metric-${key}`}>{metricLabels[key]}</a>)}
  </div>;

  return <div className="space-y-5">
    <form action={action} onSubmit={() => setShowFeedback(true)} onReset={event => event.preventDefault()} className="space-y-4" aria-label="Check manual review">
      {period.from && <input type="hidden" name="from" value={period.from}/>}
      {period.to && <input type="hidden" name="to" value={period.to}/>}
      <div><label className="block text-sm" htmlFor="manual-response">Model response JSON</label>
        <textarea id="manual-response" name="response" required rows={8} maxLength={16384} disabled={pending} value={raw} onChange={event => { setRaw(event.target.value); setShowFeedback(false); }} className="journal-field font-mono" aria-describedby="manual-response-help"/>
      </div>
      <p id="manual-response-help" className="text-sm text-muted">Paste only the JSON object, up to 16 KiB. The response must match a fresh download for these dates. Edits to trades or reviews, and changes to included trades, invalidate an earlier packet.</p>
      <div className="flex flex-wrap gap-4"><button className="journal-primary" disabled={pending}>{pending ? "Checking response…" : "Check response"}</button><button className="journal-secondary" type="button" onClick={clear} disabled={pending}>Clear response</button></div>
      {pending && <p role="status">Checking against your current journal…</p>}
      {showFeedback && !pending && state.error && <p role="alert">{state.error} Download a fresh packet if your journal or dates changed.</p>}
    </form>
    {draft && view && <section aria-label="Checked review draft" className="space-y-5 border-t border-line pt-5">
      <header className="space-y-2"><p className="journal-eyebrow">Manual review · unsaved draft</p><h3 className="text-2xl font-semibold">Review draft</h3><p role="status" className="text-sm text-muted">Structure and references checked. This does not verify that the claims are true. Nothing has been saved to your journal.</p></header>
      <p className="text-sm text-muted">{view.period.from ?? "Beginning"} through {view.period.to ?? "no end limit"} · UTC entry dates · Checked {state.checkedAt}</p>
      <section aria-label="Draft snapshot metrics" className="journal-panel space-y-4">
        <h4 className="font-semibold">Facts from the journal</h4>
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">{Object.entries(metricLabels).map(([key, label]) => <div key={key} id={`draft-metric-${key}`} className="min-w-0 scroll-mt-6"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 break-words text-xl tabular-nums">{draft.metrics[key as keyof typeof metricLabels] ?? "Not available"}</dd></div>)}</dl>
        <p className="text-sm text-muted">Counts and recorded P&amp;L describe the included snapshot only. Amounts use recorded account currency.</p>
      </section>
      {([["Observations", draft.observations], ["Tentative hypotheses", draft.hypotheses]] as const).map(([title, items]) => <section key={title} aria-label={title} className="space-y-3">
        <h4 className="font-semibold">{title}</h4>
        {items.length ? <ul className="space-y-3">{items.map((item, index) => <li className="journal-panel" key={index}><p className="whitespace-pre-wrap break-words">{item.text}</p>{citations(item)}</li>)}</ul> : <p className="text-sm text-muted">None supplied. Missing or sparse evidence should not be turned into a pattern.</p>}
      </section>)}
      <section aria-label="Review questions" className="space-y-3"><h4 className="font-semibold">Questions to reflect on</h4><ol className="list-inside list-decimal space-y-2">{draft.questions.map((question, index) => <li className="whitespace-pre-wrap break-words" key={index}>{question}</li>)}</ol></section>
      <section aria-label="Process experiment" className="journal-panel space-y-3"><h4 className="font-semibold">One process experiment</h4><p className="whitespace-pre-wrap break-words">{draft.experiment.action}</p><p className="whitespace-pre-wrap break-words"><span className="text-muted">How to assess it: </span>{draft.experiment.check}</p></section>
      <aside className="space-y-3 text-sm text-muted"><h4 className="font-semibold text-ink">Limits of this draft</h4><ul className="list-inside list-disc space-y-2">{draft.limitations.map(value => <li key={value}>{value}</li>)}</ul><p>This check reflects the journal at the time above. Later changes do not update this displayed draft. Clear or reload this page to discard it.</p></aside>
    </section>}
  </div>;
}
