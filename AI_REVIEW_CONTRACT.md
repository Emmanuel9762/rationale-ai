# AI review response boundary — CP53

CP53 adds server-side preparation and validation functions, not a live AI feature.
There is no model request, provider dependency, new endpoint, UI change, storage,
migration or charge. CP52's Review evidence screen remains the way to inspect input.

## Request boundary

`prepareReviewRequest(evidence)` takes the authenticated, owner-scoped CP51 snapshot
and returns an evidenceId, fixed instructions and a separate JSON input message.
The SHA-256 identifier covers the full serialized snapshot, including period,
trade IDs/revisions, notes, totals and truncation state. Keep that exact snapshot
on the server for validating its response; never trust a client-supplied snapshot.
A newly loaded snapshot with different data will reject the old response.

All journal text is explicitly untrusted data. Instructions must remain separate
from the JSON message when connecting a provider; do not concatenate trade notes
into system instructions. The adapter must not grant tool access. These prompt
instructions reduce ambiguity but cannot establish prompt-injection resistance.

Empty evidence is rejected before a provider request. The complete input envelope
is bounded to 512 KiB; oversized evidence requires narrower dates. Provider token
limits and cost estimates are separate controls for the future adapter.

## Response contract

The model must return a JSON object with exactly:

- version: 1
- evidenceId: the request's identifier
- observations: 0–5 objects with text, tradeIds and metricKeys
- hypotheses: 0–3 objects with the same shape, rendered as tentative hypotheses
- questions: 1–5 strings
- experiment: one object containing action and check

Each observation/hypothesis needs at least one valid trade or metric reference.
Each reference list allows at most five unique entries. Trade IDs must belong to
this snapshot. Supported metric keys are included, open, measured, missingPnl,
reviewed, missingRationale, missingSetup, missingReviewText, truncatedTextFields
and recordedPnl. These metrics describe included trades, not a complete period
when the snapshot is partial.

Responses are limited to 16 KiB. Claim and experiment text is limited to 600
Unicode code points per field; questions to 300. Nonempty text is required.
Unknown/missing fields, invalid versions, bad references, excess items, malformed
JSON, code fences and disallowed control characters fail closed. No heuristic
JSON repair or automatic retry is performed here.

`validateReviewResponse(raw, evidence)` returns the checked draft plus metrics
copied from application evidence and deterministic limitations. The model cannot
replace those metrics or suppress the limitations through extra output fields.
The caller must catch ReviewResponseError without exposing/logging raw private
payloads. Failed validation must leave the journal working and show no draft.

## What validation does not prove

Reference membership does not prove that a cited trade supports the sentence.
Natural-language arithmetic, causal claims, predictions, unsupported conclusions
or malicious prose can still pass structural validation. The instructions prohibit
these, but the validator does not claim semantic verification. Model prose must
remain clearly labelled as a draft for human review, with hypotheses separate.
Render text with escaping, never as raw HTML or executable Markdown/tools.

The tests exercise adversarial structures and preserve prompt-like notes as data;
they do not evaluate any real model. A real-provider pilot needs groundedness,
unsupported-numeric-claim, prompt-injection and usefulness evaluation before release.
No-data is blocked; sparse-data reviews may ask questions without claiming patterns.
No arbitrary trade-count threshold is treated as proof of adequate evidence.

## Next integration checkpoint

Choose a provider/model and spending ceiling. Then implement the server-only
adapter with explicit user invocation, feature/config gating, authentication,
input/output token limits, timeout/cancellation, quota and duplicate-request control,
provider-error recovery and use of this validator. Keep journal access working
when AI is unavailable. Sending data and any paid test require those concrete
choices; CP53 does not infer them or make external requests.

Developer acceptance: `node --import tsx --test tests/review-response.test.ts`.
The seven tests cover request separation, snapshot identity, exact supplied metrics,
foreign/duplicate citations, strict fields, stale evidence, byte/Unicode limits,
empty evidence and mandatory limitations. All fixtures are synthetic.
