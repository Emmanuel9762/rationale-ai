import { AuthShell } from "@/app/journal-shell";
import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "../auth/recovery-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && token.length <= 4096 && token !== "INVALID_TOKEN" && !error;
  return <AuthShell title="Choose a new password">{valid ? <ResetPasswordForm token={token}/> : <p role="alert">This reset link is missing, invalid or expired. Request a new link below.</p>}<Link className="block underline" href="/forgot-password">Request a new reset link</Link><Link className="block underline" href="/sign-in">Sign in</Link></AuthShell>;
}
