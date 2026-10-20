import { JournalShell } from "@/app/journal-shell";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import PaperCsvForm from "./paper-csv-form";

export const dynamic = "force-dynamic";
export default async function PaperCsvPage() {
  await requireCurrentUser();
  return <JournalShell active="journal">
    <nav className="journal-tools" aria-label="CSV tools"><Link href="/trades/preview">Preview CSV</Link></nav>
    <header className="journal-heading"><div><p className="journal-eyebrow">Paper trading · import preparation</p><h1>Map a trade CSV</h1><p className="mt-3 max-w-2xl text-muted">Match your column names to journal fields, validate the records, then download an import-ready file.</p></div></header>
    <div className="journal-detail-section space-y-3 text-sm text-body">
      <p>Use one row per trade with its entry and optional exit. Order lists, individual fills, partial-close reports, balance statements and HTML reports need a dedicated adapter. Mapping column names does not reconstruct trades.</p>
      <p>This page reads files locally and saves no trades. It does not connect to a broker or sync an account. No particular TradingView or MT5 export format is certified yet.</p>
      <p><a className="underline" href="/samples/paper-trades-mapping.csv" download>Download paper-trading mapping sample</a> — three synthetic trades with custom column names. Try this first on a test account.</p>
    </div>
    <PaperCsvForm />
  </JournalShell>;
}
