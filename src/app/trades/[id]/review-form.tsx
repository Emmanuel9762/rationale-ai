"use client";
import { useActionState, useState } from "react";
import type { TradeFormState } from "@/lib/trade-input";

type Props = {
  action: (state: TradeFormState, data: FormData) => Promise<TradeFormState>;
  initial: { planAdherence: string | null; reviewWentWell: string | null; reviewImprove: string | null };
};
const inputClass = "mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100";
export function ReviewForm({ action, initial }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [values, setValues] = useState(initial);
  function set(name: string, value: string) { setValues(previous => ({ ...previous, [name]: value })); }
  return <form action={formAction} className="space-y-4">
    {state.error && <p role="alert" className="text-red-300">{state.error}</p>}
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">Trade review</legend>
      <label className="block" htmlFor="planAdherence">Did you follow your plan?
        <select id="planAdherence" name="planAdherence" required className={inputClass} value={values.planAdherence ?? ""} onChange={event => set("planAdherence", event.target.value)}>
          <option value="" disabled>Select an answer</option><option value="followed">Followed my plan</option><option value="partly">Partly followed my plan</option><option value="not_followed">Did not follow my plan</option>
        </select>
      </label>
      {[["reviewWentWell", "What went well?"], ["reviewImprove", "What would you improve next time?"]].map(([name, label]) => <label key={name} htmlFor={name} className="block">{label}<textarea id={name} name={name} rows={3} maxLength={2000} value={values[name as keyof typeof values] ?? ""} onChange={event => set(name, event.target.value)} className={inputClass}/></label>)}
    </fieldset>
    <button type="submit" disabled={pending} className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-950 disabled:opacity-50">{pending ? "Saving…" : "Save review"}</button>
  </form>;
}
