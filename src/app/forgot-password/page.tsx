import Link from "next/link";
import { ForgotPasswordForm } from "../auth/recovery-form";
export const dynamic = "force-dynamic";
export default function ForgotPasswordPage() {
  return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100"><div className="mx-auto max-w-md space-y-6"><h1 className="text-3xl font-semibold">Reset your password</h1><p>Enter your account email to request a reset link.</p><ForgotPasswordForm/><Link className="block underline" href="/sign-in">Back to sign in</Link></div></main>;
}
