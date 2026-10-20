"use client";
import { useActionState } from "react";
import { signIn, signUp } from "./actions";
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [state, action, pending] = useActionState(mode === "sign-up" ? signUp : signIn, { error: "" });
  return <form action={action} className="space-y-5">
    {state.error && <p role="alert" className="text-red-300">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
    {mode === "sign-up" && <label className="block">Name<input className="journal-field" name="name" autoComplete="name" required maxLength={100}/></label>}
    <label className="block">Email<input className="journal-field" name="email" type="email" autoComplete="email" required maxLength={255}/></label>
    <label className="block">Password<input className="journal-field" name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={8} maxLength={128}/></label>
    <button disabled={pending} className="journal-primary">{pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
  </form>;
}
