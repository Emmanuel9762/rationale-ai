"use client";
import { JournalShell, JournalHeader } from "./journal-shell";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <JournalShell active="dashboard" narrow><JournalHeader eyebrow="Connection interrupted" title="Dashboard unavailable"/><div className="journal-detail-section space-y-4"><p>Could not load the database. Your metrics have not been replaced with zeroes.</p><button onClick={reset} className="journal-primary">Try again</button></div></JournalShell>;
}
