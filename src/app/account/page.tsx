import Link from "next/link";
import { requireSession } from "@/lib/auth/current-user";
import { signOut } from "../sign-in/actions";
export const dynamic = "force-dynamic";
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const session = await requireSession();
  const needsLink = (await searchParams).link === "required";
  return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100"><div className="mx-auto max-w-lg space-y-6"><h1 className="text-3xl font-semibold">Your account</h1><p>Signed in as {session.user.email}</p><p className="text-sm text-zinc-400">Account reference</p><code className="block break-all">{session.user.id}</code>{needsLink && <p role="alert">This email already belongs to an unlinked journal. Ask the journal owner to link your account reference before continuing.</p>}<Link className="block underline" href="/">Open journal</Link><form action={signOut}><button className="rounded border border-zinc-600 px-4 py-2">Sign out</button></form></div></main>;
}
