import Link from "next/link";
import { VerifyEmailForm } from "../auth/recovery-form";
export const dynamic = "force-dynamic";
export default function VerifyEmailPage() {
  return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100"><div className="mx-auto max-w-md space-y-6"><h1 className="text-3xl font-semibold">Verify your email</h1><p>Send a code to your account email, then enter the most recent six-digit code. Check your spam folder if it does not arrive.</p><VerifyEmailForm/><Link className="block underline" href="/account">Back to account</Link><Link className="block underline" href="/sign-in">Sign in</Link></div></main>;
}
