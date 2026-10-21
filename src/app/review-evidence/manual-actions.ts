"use server";

import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { checkManualReview, type ManualReviewState } from "@/lib/manual-review";
import { reviewEvidence } from "@/lib/review-evidence";
import { ReviewResponseError, REVIEW_OUTPUT_MAX_BYTES } from "@/lib/review-response";
import { saveManualReview, savedReviewHref } from "@/lib/saved-reviews";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function checkManualReviewAction(_previous: ManualReviewState, data: FormData): Promise<ManualReviewState> {
  const user = await requireCurrentUser();
  const responses = data.getAll("response"), raw = responses[0];
  if (responses.length !== 1 || typeof raw !== "string" || !raw.trim() || Buffer.byteLength(raw, "utf8") > REVIEW_OUTPUT_MAX_BYTES) {
    return { error: "Paste one JSON response of at most 16 KiB." };
  }
  const params: JournalSearchParams = {};
  for (const key of ["from", "to"]) {
    const values = data.getAll(key);
    if (values.some(value => typeof value !== "string")) return { raw, error: "Check the entry dates." };
    params[key] = values.length > 1 ? values as string[] : values[0] as string | undefined;
  }
  const { filters: period, errors } = parseJournalFilters(params);
  if (errors.length) return { raw, error: "Check the entry dates before checking a response." };
  try {
    const evidence = await reviewEvidence(db, user.id, period);
    const view = checkManualReview(raw, evidence);
    return { error: "", raw, view, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { raw, error: error instanceof ReviewResponseError ? error.message : "Could not check this response. Please try again." };
  }
}

export async function saveManualReviewAction(_previous: { error: string }, data: FormData): Promise<{ error: string }> {
  const user = await requireCurrentUser();
  const responses = data.getAll("response"), raw = responses[0];
  if (responses.length !== 1 || typeof raw !== "string" || !raw.trim() || Buffer.byteLength(raw, "utf8") > REVIEW_OUTPUT_MAX_BYTES) {
    return { error: "Paste one JSON response of at most 16 KiB." };
  }
  const params: JournalSearchParams = {};
  for (const key of ["from", "to"]) {
    const values = data.getAll(key);
    if (values.some(value => typeof value !== "string")) return { error: "Check the entry dates." };
    params[key] = values.length > 1 ? values as string[] : values[0] as string | undefined;
  }
  const { filters: period, errors } = parseJournalFilters(params);
  if (errors.length) return { error: "Check the entry dates before saving a response." };
  let id: string;
  try {
    id = await saveManualReview(db, user.id, raw, period);
  } catch (error) {
    return { error: error instanceof ReviewResponseError ? error.message : "Could not confirm the save. Retry the same response unchanged to recover it without adding a duplicate." };
  }
  revalidatePath("/review-evidence/history");
  redirect(savedReviewHref(id));
}
