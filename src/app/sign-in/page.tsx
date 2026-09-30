import Link from "next/link";
import { AuthForm } from "./auth-form";
export const dynamic = "force-dynamic";
export default function SignInPage() {
  return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100"><div className="mx-auto max-w-md space-y-6"><p className="text-sm text-zinc-400">RationaleAI</p><h1 className="text-3xl font-semibold">Sign in to your journal</h1><AuthForm mode="sign-in"/><p>New here? <Link className="underline" href="/sign-up">Create an account</Link></p></div></main>;
}
