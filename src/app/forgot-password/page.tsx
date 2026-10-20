import { AuthShell } from "@/app/journal-shell";
import Link from "next/link";
import { ForgotPasswordForm } from "../auth/recovery-form";
export const dynamic = "force-dynamic";
export default function ForgotPasswordPage() {
  return <AuthShell title="Reset your password"><p>Enter your account email to request a reset link.</p><ForgotPasswordForm/><Link className="block underline" href="/sign-in">Back to sign in</Link></AuthShell>;
}
