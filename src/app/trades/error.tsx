"use client";
import { JournalShell, JournalHeader } from "../journal-shell";
export default function TradeError({ reset }: { reset: () => void }) {
  return <JournalShell active="journal" narrow><JournalHeader eyebrow="Connection interrupted" title="Unable to load your trades"/><div className="journal-detail-section space-y-4"><p>Check your database connection, then try again.</p><button className="journal-primary" onClick={reset}>Try again</button></div></JournalShell>;
}
