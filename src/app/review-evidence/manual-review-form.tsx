"use client";

import { useActionState, useState } from "react";
import type { ManualReviewState } from "@/lib/manual-review";
import { checkManualReviewAction } from "./manual-actions";
import ReviewDraft from "./review-draft";
import SaveReviewForm from "./save-review-form";

type Period = { from?: string; to?: string };

export default function ManualReviewForm({ period }: { period: Period }) {
  const [state, action, pending] = useActionState<ManualReviewState, FormData>(checkManualReviewAction, { error: "" });
  const [raw, setRaw] = useState(state.raw ?? "");
  const [showFeedback, setShowFeedback] = useState(true);
  const view = showFeedback && !pending && state.raw === raw ? state.view : undefined;
  function clear() { setRaw(""); setShowFeedback(false); }

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
    {view && state.checkedAt && <>
      <ReviewDraft view={view} checkedAt={state.checkedAt}/>
      <SaveReviewForm key={raw} raw={raw} period={period}/>
    </>}
  </div>;
}
