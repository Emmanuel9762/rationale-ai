import type { buildReviewEvidence } from "./review-evidence";
import { journalHref } from "./journal-filters";
import { tradeContextHref } from "./journal-navigation";
import { prepareReviewRequest, reviewLimitations, validateReviewResponse, ReviewResponseError, REVIEW_INPUT_MAX_BYTES } from "./review-response";

type Evidence = ReturnType<typeof buildReviewEvidence>;
export const REVIEW_PACKET_MAX_BYTES = REVIEW_INPUT_MAX_BYTES;

// A user-controlled download, not a provider request or a journal backup.
export function manualReviewPacket(evidence: Evidence) {
  const { evidenceId, instructions, input } = prepareReviewRequest(evidence);
  const packet = JSON.stringify({
    format: "rationale-review-packet", version: 1, evidenceId,
    instructions, limitations: reviewLimitations(evidence),
    evidence: JSON.parse(input).evidence,
  }, null, 2) + "\n";
  if (Buffer.byteLength(packet, "utf8") > REVIEW_PACKET_MAX_BYTES) {
    throw new ReviewResponseError("Review packet is too large. Narrow the entry dates before downloading.");
  }
  return packet;
}

// Always supply fresh, server-owned evidence. Never accept the packet back as truth.
export function checkManualReview(raw: string, evidence: Evidence) {
  const draft = validateReviewResponse(raw, evidence);
  const ids = new Set([...draft.observations, ...draft.hypotheses].flatMap(item => item.tradeIds));
  const period = { from: evidence.period.from ?? undefined, to: evidence.period.to ?? undefined };
  const sources = evidence.entries.filter(entry => ids.has(entry.id)).map(entry => ({
    id: entry.id, label: `${entry.symbol} · ${entry.entryTime.slice(0, 10)}`,
    href: tradeContextHref(entry.id, journalHref(period)),
  }));
  return { draft, sources, period: evidence.period };
}

export type ManualReviewState = {
  error: string;
  raw?: string;
  checkedAt?: string;
  view?: ReturnType<typeof checkManualReview>;
};
