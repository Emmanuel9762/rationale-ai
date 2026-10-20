import { JournalShell, JournalHeader } from "@/app/journal-shell";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import CsvPreviewForm from "./preview-form";

export const dynamic = "force-dynamic";

export default async function CsvPreviewPage() {
  await requireCurrentUser();
  return <JournalShell active="journal">
      <nav className="journal-tools" aria-label="CSV tools"><Link href="/trades/imports">Import history</Link></nav>
      <JournalHeader eyebrow="Import trades" title="Preview trade CSV"><p>Preview a file, fix any invalid records, then confirm to save the whole batch. Preview alone never saves trades.</p></JournalHeader>
      <p className="rounded-xl border border-line p-4 text-sm">Different column names? <Link className="underline" href="/trades/map-csv">Map a paper-trade CSV</Link> locally before importing. Use one row per whole trade.</p>
      <CsvPreviewForm />

  </JournalShell>;
}
