"use client";
import { useActionState, useState } from "react";
import type { TradeFormState } from "@/lib/trade-input";

type Props = {
  action: (state: TradeFormState, data: FormData) => Promise<TradeFormState>;
  initial?: Record<string, string>;
  submitLabel: string;
  submissionKey?: string;
  revision?: number;
  reloadHref?: string;
};
const fields = [
  { name: "symbol", label: "Symbol", type: "text", required: true, maxLength: 20 },
  { name: "entryPrice", label: "Entry price", type: "number", required: true },
  { name: "quantity", label: "Quantity", type: "number", required: true },
  { name: "entryTime", label: "Entry time (UTC)", type: "datetime-local", required: true },
  { name: "exitPrice", label: "Exit price", type: "number", required: false },
  { name: "exitTime", label: "Exit time (UTC)", type: "datetime-local", required: false },
  { name: "pnl", label: "Realized P&L (account currency)", type: "number", required: false },
  { name: "setup", label: "Setup", type: "text", required: false, maxLength: 100 },
];
const inputClass = "mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-2 focus:outline-zinc-400";
export function TradeForm({ action, initial = {}, submitLabel, submissionKey, revision, reloadHref }: Props) {
  const [state, formAction, pending] = useActionState<TradeFormState, FormData>(action, { error: "", submissionKey, revision });
  const [values, setValues] = useState(state.values ?? initial);
  function set(name: string, value: string) { setValues(previous => ({ ...previous, [name]: value })); }
  return <form action={formAction} className="space-y-6">
    {revision !== undefined && <input type="hidden" name="revision" value={state.revision ?? revision}/> }
    {state.conflict && reloadHref && <a className="block underline" href={reloadHref}>Load latest saved version (discards this draft)</a>}
    {submissionKey && <input type="hidden" name="submissionKey" value={state.submissionKey ?? submissionKey}/> }
    <p className="text-sm text-zinc-400">Leave exit fields blank for an open trade. To close it, enter both exit price and time. Enter realized P&L from your broker; it is not inferred from quantity. All times are UTC.</p>
    {state.error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950 p-4 text-red-100">{state.error}</p>}
    <fieldset disabled={pending} className="grid gap-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:grid-cols-2">
      <legend className="px-2 font-medium">Trade details</legend>
      <label className="text-sm text-zinc-300" htmlFor="direction">Direction<select id="direction" name="direction" value={values.direction ?? ""} onChange={event => set("direction", event.target.value)} required className={inputClass}><option value="" disabled>Select direction</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
      {fields.map(field => <label className="text-sm text-zinc-300" key={field.name} htmlFor={field.name}>{field.label}<input {...field} id={field.name} value={values[field.name] ?? ""} onChange={event => set(field.name, event.target.value)} step={field.type === "number" ? field.name === "pnl" ? "0.01" : "0.000001" : undefined} min={field.type === "number" && field.name !== "pnl" ? "0.000001" : undefined} className={inputClass}/></label>)}
      {[["rationale", "Why did you take this trade?"], ["notes", "Notes"]].map(([name, label]) => <label key={name} htmlFor={name} className="text-sm text-zinc-300 sm:col-span-2">{label}<textarea id={name} name={name} rows={4} maxLength={2000} value={values[name] ?? ""} onChange={event => set(name, event.target.value)} className={inputClass}/></label>)}
    </fieldset>
    <button type="submit" disabled={pending || state.conflict} className="rounded-lg bg-zinc-100 px-5 py-2.5 font-medium text-zinc-950 disabled:opacity-50">{pending ? "Saving…" : submitLabel}</button>
  </form>;
}
