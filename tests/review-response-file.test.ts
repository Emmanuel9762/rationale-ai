import assert from "node:assert/strict";
import test from "node:test";
import { readReviewResponseFile } from "../src/lib/review-response-file";
import { REVIEW_OUTPUT_MAX_BYTES } from "../src/lib/review-limits";

test("response files preserve JSON text and Unicode, accept a UTF-8 BOM and leave citation validation to the server", async () => {
  const raw = '{ "version": 1, "notes": "EURUSD 📝 <script>text</script>", "evidenceId": "untrusted" }\n';
  assert.equal(await readReviewResponseFile(new Blob([raw])), raw);
  assert.equal(await readReviewResponseFile(new Blob(["\uFEFF", raw])), raw);
  assert.equal(await readReviewResponseFile(new Blob(["{}"])), "{}");
});

test("response files enforce bytes before reading and at the boundary, including multi-byte text", async () => {
  const prefix = '{"text":"', suffix = '"}';
  const exact = prefix + "x".repeat(REVIEW_OUTPUT_MAX_BYTES - prefix.length - suffix.length) + suffix;
  assert.equal(await readReviewResponseFile(new Blob([exact])), exact);
  await assert.rejects(readReviewResponseFile(new Blob([exact, " "])), /16 KiB/);
  await assert.rejects(readReviewResponseFile(new Blob([JSON.stringify({ text: "😀".repeat(5000) })])), /16 KiB/);
  let reads = 0;
  await assert.rejects(readReviewResponseFile({ size: REVIEW_OUTPUT_MAX_BYTES + 1, arrayBuffer: async () => { reads++; return new ArrayBuffer(0); } }), /16 KiB/);
  assert.equal(reads, 0);
  await assert.rejects(readReviewResponseFile({ size: 2, arrayBuffer: async () => new ArrayBuffer(REVIEW_OUTPUT_MAX_BYTES + 1) }), /16 KiB/);
});

test("response files reject unreadable, invalid UTF-8, empty, fenced, non-object and evidence-packet inputs", async () => {
  await assert.rejects(readReviewResponseFile(new Blob([])), /non-empty/);
  await assert.rejects(readReviewResponseFile(new Blob([new Uint8Array([0xff, 0xfe, 0x00])])), /UTF-8/);
  for (const raw of [" ", "not JSON", "```json\n{}\n```", "{} extra", "[]", "null", '"text"', "1", "true"]) {
    await assert.rejects(readReviewResponseFile(new Blob([raw])), /JSON/);
  }
  await assert.rejects(readReviewResponseFile(new Blob(['{"format":"rationale-review-packet"}'])), /evidence packet/);
  await assert.rejects(readReviewResponseFile({ size: 2, arrayBuffer: async () => { throw new Error("private filesystem details"); } }), error => error instanceof Error && error.message.includes("Could not read") && !error.message.includes("private"));
});
