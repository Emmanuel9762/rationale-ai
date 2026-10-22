"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ManualReviewState } from "@/lib/manual-review";
import { readReviewResponseFile, ReviewResponseFileError } from "@/lib/review-response-file";
import { REVIEW_OUTPUT_MAX_BYTES } from "@/lib/review-limits";
import { checkManualReviewAction } from "./manual-actions";
import ReviewDraft from "./review-draft";
import SaveReviewForm from "./save-review-form";

type Period = { from?: string; to?: string };

export default function ManualReviewForm({ period }: { period: Period }) {
  const [state, action, pending] = useActionState<ManualReviewState, FormData>(checkManualReviewAction, { error: "" });
  const [raw, setRaw] = useState(state.raw ?? "");
  const [showFeedback, setShowFeedback] = useState(true);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileNotice, setFileNotice] = useState("");
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; }, []);
  const view = showFeedback && !pending && state.raw === raw ? state.view : undefined;
  function changeRaw(value: string) {
    generation.current++; setReading(false); setFileError(""); setFileNotice("");
    if (fileInput.current) fileInput.current.value = "";
    setRaw(value); setShowFeedback(false);
  }
  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Allow retrying the same file, including after a failed read.
    event.currentTarget.value = "";
    if (!file) return;
    const current = ++generation.current;
    setShowFeedback(false); setFileError(""); setFileNotice(""); setReading(true);
    try {
      const response = await readReviewResponseFile(file);
      if (generation.current === current) {
        setRaw(response); setFileNotice("Response loaded locally. Inspect the text, then choose Check response.");
      }
    } catch (error) {
      if (generation.current === current) setFileError((error instanceof ReviewResponseFileError ? error.message : "Could not read this file.") + " The response text below has been kept.");
    } finally { if (generation.current === current) setReading(false); }
  }

  return <div className="space-y-5">
    <section aria-label="Load review response" className="journal-panel space-y-3">
      <label className="block text-sm" htmlFor="manual-response-file">Response JSON file</label>
      <input id="manual-response-file" ref={fileInput} type="file" accept=".json,application/json" className="journal-field" disabled={pending} onChange={loadFile} aria-describedby="manual-file-help"/>
      <p id="manual-file-help" className="text-sm text-muted">Load the response from Codex, or paste it below. UTF-8 JSON, up to 16 KiB. Loading only reads the file in this browser; Check response sends the text to your journal for validation.</p>
      {reading && <p role="status" className="text-sm">Reading response locally…</p>}
      {fileNotice && <p role="status" className="text-sm">{fileNotice}</p>}
      {fileError && <p role="alert" className="text-sm">{fileError}</p>}
    </section>
    <form action={action} onSubmit={event => { if (reading) event.preventDefault(); else { setShowFeedback(true); setFileError(""); setFileNotice(""); } }} onReset={event => event.preventDefault()} className="space-y-4" aria-label="Check manual review">
      {period.from && <input type="hidden" name="from" value={period.from}/>}
      {period.to && <input type="hidden" name="to" value={period.to}/>}
      <div><label className="block text-sm" htmlFor="manual-response">Model response JSON</label>
        <textarea id="manual-response" name="response" required rows={8} maxLength={REVIEW_OUTPUT_MAX_BYTES} disabled={pending} value={raw} onChange={event => changeRaw(event.target.value)} className="journal-field font-mono" aria-describedby="manual-response-help"/>
      </div>
      <p id="manual-response-help" className="text-sm text-muted">Paste only the JSON object, up to 16 KiB. The response must match a fresh download for these dates. Edits to trades or reviews, and changes to included trades, invalidate an earlier packet.</p>
      <div className="flex flex-wrap gap-4"><button className="journal-primary" disabled={pending || reading}>{pending ? "Checking response…" : "Check response"}</button><button className="journal-secondary" type="button" onClick={() => changeRaw("")} disabled={pending}>Clear response</button></div>
      {pending && <p role="status">Checking against your current journal…</p>}
      {showFeedback && !pending && state.error && <p role="alert">{state.error} Download a fresh packet if your journal or dates changed.</p>}
    </form>
    {view && state.checkedAt && <>
      <ReviewDraft view={view} checkedAt={state.checkedAt}/>
      <SaveReviewForm key={raw} raw={raw} period={period}/>
    </>}
  </div>;
}
