"use client";

import { useActionState } from "react";
import { saveManualReviewAction } from "./manual-actions";

export default function SaveReviewForm({ raw, period }: { raw: string; period: { from?: string; to?: string } }) {
  const [state, action, pending] = useActionState(saveManualReviewAction, { error: "" });
  return <form action={action} aria-label="Save manual review" className="journal-panel space-y-4">
    <input type="hidden" name="response" value={raw}/>
    {period.from && <input type="hidden" name="from" value={period.from}/>}
    {period.to && <input type="hidden" name="to" value={period.to}/>}
    <p className="text-sm text-muted">Keep this draft and its original evidence in your review history. Saving checks your journal again; changed evidence requires a fresh response. Trades and self-assessments stay as they are.</p>
    <button className="journal-primary" disabled={pending}>{pending ? "Saving review…" : "Save review draft"}</button>
    {state.error && <p role="alert">{state.error}</p>}
  </form>;
}
