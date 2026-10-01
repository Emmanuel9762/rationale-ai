"use client";
import { useActionState, useEffect, useState } from "react";
import { requestReset, resetPassword, sendVerification, verifyEmail, type RecoveryState } from "./recovery-actions";
const input = "mt-2 block w-full rounded border border-zinc-700 bg-zinc-900 p-3";
const button = "rounded bg-zinc-100 px-5 py-3 text-zinc-950 disabled:opacity-50";
const initial: RecoveryState = { error: "" };
function Status({ state }: { state: RecoveryState }) {
  return <>{state.error && <p role="alert" className="text-red-300">{state.error}</p>}{state.notice && <p role="status">{state.notice}</p>}</>;
}
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestReset, initial);
  return <form action={action} className="space-y-5"><Status state={state}/><label className="block">Email<input name="email" type="email" autoComplete="email" required maxLength={255} className={input}/></label><button className={button} disabled={pending}>{pending ? "Sending…" : "Send reset email"}</button></form>;
}
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);
  return <form action={action} className="space-y-5"><Status state={state}/>{!state.done && <><input type="hidden" name="token" value={token}/><label className="block">New password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className={input}/></label><label className="block">Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className={input}/></label><button className={button} disabled={pending}>{pending ? "Saving…" : "Update password"}</button></>}</form>;
}
export function VerifyEmailForm() {
  const [sent, send, sending] = useActionState(sendVerification, initial);
  const [verified, verify, verifying] = useActionState(verifyEmail, initial);
  const [email, setEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!sent.notice) return;
    const until = Date.now() + 60000;
    const timer = setInterval(() => setCooldown(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [sent]);
  return <div className="space-y-6"><Status state={verified}/>{!verified.done && <><form action={send} className="space-y-4"><Status state={sent}/><label className="block">Email<input name="email" type="email" autoComplete="email" required maxLength={255} className={input} value={email} onChange={e => setEmail(e.target.value)}/></label><button className={button} disabled={sending || cooldown > 0}>{sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Send / resend code"}</button></form><form action={verify} className="space-y-4"><input name="email" type="hidden" value={email}/><label className="block">Verification code<input name="otp" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={6} className={input}/></label><button className={button} disabled={verifying || !email}>{verifying ? "Verifying…" : "Verify email"}</button></form></>}</div>;
}
