import Link from "next/link";
import { JournalShell, JournalHeader } from "@/app/journal-shell";
import { requireSession } from "@/lib/auth/current-user";
import { signOut } from "../sign-in/actions";
export const dynamic = "force-dynamic";
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const session = await requireSession();
  const needsLink = (await searchParams).link === "required";
  return <JournalShell active="account" narrow>
    <JournalHeader eyebrow="Your workspace" title="Your account"><p>Manage your sign-in and journal access.</p></JournalHeader>
    <section className="journal-detail-section space-y-5" aria-label="Account details">
      <h2>Account details</h2>
      <dl className="space-y-5">
        <div><dt className="text-sm text-muted">Signed in as</dt><dd className="mt-1 break-all">{session.user.email}</dd></div>
        <div><dt className="text-sm text-muted">Email</dt><dd className="mt-2"><span className={`journal-badge ${session.user.emailVerified ? "" : "pending"}`}>{session.user.emailVerified ? "Verified" : "Not verified"}</span></dd></div>
        <div><dt className="text-sm text-muted">Account reference</dt><dd className="mt-2"><code className="block break-all rounded-lg bg-canvas p-3 text-sm text-body">{session.user.id}</code></dd></div>
      </dl>
      {!session.user.emailVerified && <Link className="journal-secondary" href="/verify-email">Verify your email</Link>}
      {needsLink && <p role="alert">This email already belongs to an unlinked journal. Ask the journal owner to link your account reference before continuing.</p>}
    </section>
    <div className="flex flex-wrap items-center gap-4"><Link className="journal-primary" href="/">Open journal</Link><form action={signOut}><button className="journal-secondary">Sign out</button></form></div>
  </JournalShell>;
}
