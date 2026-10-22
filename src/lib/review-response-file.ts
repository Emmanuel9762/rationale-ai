import { REVIEW_OUTPUT_MAX_BYTES } from "./review-limits";

export class ReviewResponseFileError extends Error {}

// Browser-only reading: no upload and no assertion about evidence or citations.
// The server still validates the entire response against its own fresh snapshot.
export async function readReviewResponseFile(file: Pick<File, "size" | "arrayBuffer">) {
  if (file.size === 0) throw new ReviewResponseFileError("Choose a non-empty JSON response file.");
  if (file.size > REVIEW_OUTPUT_MAX_BYTES) throw new ReviewResponseFileError("Use a response file no larger than 16 KiB.");
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); }
  catch { throw new ReviewResponseFileError("Could not read this file. Choose it again or paste the response."); }
  if (bytes.byteLength > REVIEW_OUTPUT_MAX_BYTES) throw new ReviewResponseFileError("Use a response file no larger than 16 KiB.");
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ReviewResponseFileError("Use a UTF-8 JSON response file."); }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new ReviewResponseFileError("The file must contain only a JSON object, without Markdown fences or extra prose."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReviewResponseFileError("The file must contain one JSON response object.");
  }
  if ("format" in value && value.format === "rationale-review-packet") {
    throw new ReviewResponseFileError("This is an evidence packet. Choose the JSON response returned by Codex instead.");
  }
  return raw;
}
