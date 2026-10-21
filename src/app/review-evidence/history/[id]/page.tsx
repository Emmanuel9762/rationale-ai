import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { JournalHeader, JournalShell } from "@/app/journal-shell";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { findSavedReview, reviewHistoryHref } from "@/lib/saved-reviews";
import ReviewDraft from "../../review-draft";

export const dynamic = "force-dynamic";

export default async function SavedReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const review = await findSavedReview(db, user.id, id);
  if (!review) notFound();
  return <JournalShell active="evidence">
    <JournalHeader eyebrow="Review history" title="Saved review" actions={<Link className="journal-secondary" href={reviewHistoryHref()}>Back to review history</Link>}>
      <p>This draft preserves its original evidence. Trade links open current records; later edits may differ from the snapshot below.</p>
    </JournalHeader>
    <ReviewDraft view={review.view} checkedAt={review.createdAt.toISOString()} saved/>
    <section aria-label="Original saved evidence" className="space-y-4">
      <h2 className="text-xl font-semibold">Original evidence</h2>
      <p className="text-sm text-muted">The same bounded excerpts and newest-100-trade limit apply. Shortened fields are marked; this is not a full journal backup.</p>
      {review.evidence.entries.map(entry => <details key={entry.id} className="journal-detail-section">
        <summary className="cursor-pointer break-words">{entry.symbol} · {entry.direction} · {entry.entryTime}</summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">{([
          ["Setup", entry.setup], ["Status", entry.status], ["Entry price", entry.entryPrice],
          ["Exit price", entry.exitPrice], ["Quantity", entry.quantity], ["Exit time (UTC)", entry.exitTime],
          ["Recorded P&L", entry.recordedPnl], ["Reviewed (UTC)", entry.reviewedAt],
          ["Plan adherence", entry.planAdherence], ["Rationale", entry.rationale], ["Notes", entry.notes],
          ["What went well", entry.reviewWentWell], ["What to improve", entry.reviewImprove],
        ] as const).map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-sm text-muted">{label}</dt><dd className="whitespace-pre-wrap break-words">{value ?? "Not recorded"}</dd></div>)}</dl>
        {entry.truncatedFields.length > 0 && <p className="mt-4 text-sm text-amber-200">Shortened fields: {entry.truncatedFields.map(field => ({ rationale: "Rationale", notes: "Notes", reviewWentWell: "What went well", reviewImprove: "What to improve" })[field] ?? field).join(", ")}. These excerpts were saved as shown.</p>}
      </details>)}
    </section>
  </JournalShell>;
}
