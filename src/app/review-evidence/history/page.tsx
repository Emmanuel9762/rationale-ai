import Link from "next/link";
import { db } from "@/db";
import { JournalHeader, JournalShell } from "@/app/journal-shell";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { reviewHistory, reviewHistoryHref, savedReviewHref } from "@/lib/saved-reviews";

export const dynamic = "force-dynamic";

export default async function ReviewHistoryPage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const { page, errors } = parseJournalFilters({ page: params.page });
  const result = errors.length ? { reviews: [], hasNext: false } : await reviewHistory(db, user.id, page);
  return <JournalShell active="evidence">
    <JournalHeader eyebrow="Reflect over time" title="Review history" actions={<Link className="journal-secondary" href="/review-evidence">Prepare a review</Link>}>
      <p>Your saved manual drafts, newest first. Each retains the evidence used when it was saved. Model claims still need your judgment.</p>
    </JournalHeader>
    {errors.length ? <p role="alert">{errors.join(" ")}</p> : <>
      {result.reviews.length ? <ul className="space-y-4">{result.reviews.map(review => <li className="journal-detail-section space-y-3" key={review.id}>
        <p className="journal-eyebrow">Manual review · saved draft</p>
        <h2 className="text-lg font-semibold"><Link className="underline" href={savedReviewHref(review.id)}>Review saved {review.createdAt.toISOString()}</Link></h2>
        <p className="text-sm text-muted">{review.from ?? "Beginning"} through {review.to ?? "no end limit"} · UTC entry dates · {review.included} included {review.included === 1 ? "trade" : "trades"}</p>
      </li>)}</ul> : <p className="journal-detail-section">{page > 1 ? "No saved reviews on this page." : "No saved reviews yet. Check a model response on Review evidence, then choose Save review draft."}</p>}
      <nav aria-label="Review pagination" className="flex flex-wrap gap-5 text-sm">
        {page > 1 && <><Link className="underline" href={reviewHistoryHref()}>First page</Link><Link className="underline" href={reviewHistoryHref(page - 1)}>Previous</Link></>}
        <span>Page {page}</span>{result.hasNext && page < 100000 && <Link className="underline" href={reviewHistoryHref(page + 1)}>Next</Link>}
      </nav>
    </>}
  </JournalShell>;
}
