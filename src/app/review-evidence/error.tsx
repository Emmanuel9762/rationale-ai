"use client";

import Link from "next/link";
import { JournalHeader, JournalShell } from "@/app/journal-shell";

export default function ReviewError({ reset }: { reset: () => void }) {
  return <JournalShell active="evidence" narrow>
    <JournalHeader eyebrow="Connection interrupted" title="Review unavailable"/>
    <div className="journal-detail-section space-y-4"><p>Could not load this review. Try again when the connection recovers.</p>
      <div className="flex flex-wrap gap-4"><button className="journal-primary" onClick={reset}>Try again</button><Link className="journal-secondary" href="/review-evidence">Review evidence</Link></div>
    </div>
  </JournalShell>;
}
