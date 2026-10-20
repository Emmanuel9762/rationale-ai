import { AuthShell } from "@/app/journal-shell";
import Link from "next/link";
import { AuthForm } from "../sign-in/auth-form";
export const dynamic = "force-dynamic";
export default function SignUpPage() {
  return <AuthShell title="Create your journal"><AuthForm mode="sign-up"/><Link className="block underline" href="/verify-email">Enter or resend a verification code</Link><p>Already registered? <Link className="underline" href="/sign-in">Sign in</Link></p></AuthShell>;
}
