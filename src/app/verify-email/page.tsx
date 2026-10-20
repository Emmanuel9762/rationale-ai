import { AuthShell } from "@/app/journal-shell";
import Link from "next/link";
import { VerifyEmailForm } from "../auth/recovery-form";
export const dynamic = "force-dynamic";
export default function VerifyEmailPage() {
  return <AuthShell title="Verify your email"><p>Send a code to your account email, then enter the most recent six-digit code. Check your spam folder if it does not arrive.</p><VerifyEmailForm/><Link className="block underline" href="/account">Back to account</Link><Link className="block underline" href="/sign-in">Sign in</Link></AuthShell>;
}
