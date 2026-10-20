import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { reviewEvidence } from "@/lib/review-evidence";
import { manualReviewPacket } from "@/lib/manual-review";
import { ReviewResponseError } from "@/lib/review-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const url = new URL(request.url), params: JournalSearchParams = {};
  for (const key of ["from", "to"]) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  const { filters: period, errors } = parseJournalFilters(params);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (errors.length) return new Response(errors.join("\n"), { status: 400, headers });
  try {
    const evidence = await reviewEvidence(db, user.id, period);
    return new Response(manualReviewPacket(evidence), { headers: {
      ...headers, "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rationale-review-packet.json"',
    } });
  } catch (error) {
    return new Response(error instanceof ReviewResponseError ? error.message : "Review packet unavailable. Please try again.", {
      status: error instanceof ReviewResponseError ? 422 : 503, headers,
    });
  }
}
