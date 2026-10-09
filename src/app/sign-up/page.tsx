import Link from "next/link";
import { AuthForm } from "../sign-in/auth-form";
export const dynamic = "force-dynamic";
export default function SignUpPage() {
  return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100"><div className="mx-auto max-w-md space-y-6"><p className="text-sm text-zinc-400">RationaleAI</p><h1 className="text-3xl font-semibold">Create your journal</h1><AuthForm mode="sign-up"/><Link className="block underline" href="/verify-email">Enter or resend a verification code</Link><p>Already registered? <Link className="underline" href="/sign-in">Sign in</Link></p></div></main>;
}
