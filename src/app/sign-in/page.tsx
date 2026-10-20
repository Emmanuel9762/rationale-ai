import { AuthShell } from "@/app/journal-shell";
import Link from "next/link";
import { AuthForm } from "./auth-form";
export const dynamic = "force-dynamic";
export default function SignInPage() {
  return <AuthShell title="Sign in to your journal"><AuthForm mode="sign-in"/><Link className="block underline" href="/forgot-password">Forgot password?</Link><Link className="block underline" href="/verify-email">Verify your email</Link><p>New here? <Link className="underline" href="/sign-up">Create an account</Link></p></AuthShell>;
}
