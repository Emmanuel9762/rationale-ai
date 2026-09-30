"use client";
import { useActionState } from "react";
import { signIn, signUp } from "./actions";
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [state, action, pending] = useActionState(mode === "sign-up" ? signUp : signIn, { error: "" });
  return <form action={action} className="space-y-5">
    {state.error && <p role="alert" className="text-red-300">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
    {mode === "sign-up" && <label className="block">Name<input className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-900 p-3" name="name" autoComplete="name" required maxLength={100}/></label>}
    <label className="block">Email<input className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-900 p-3" name="email" type="email" autoComplete="email" required maxLength={255}/></label>
    <label className="block">Password<input className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-900 p-3" name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={8} maxLength={128}/></label>
    <button disabled={pending} className="rounded bg-zinc-100 px-5 py-3 text-zinc-950 disabled:opacity-50">{pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
  </form>;
}
