# AI review response boundary — CP53

CP53 added server-side preparation and validation functions. CP54 added a disabled
internal runner; CP56 adds an optional manual packet/reply workflow, documented in
MANUAL_REVIEW.md. No live provider is configured and Rationale makes no model call.
Review evidence remains the way to inspect input. The manual flow validates a pasted
reply against a freshly loaded, server-owned snapshot and displays an unsaved draft.

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

## Request runner — CP54

`createReviewRunner` coordinates the evidence loader, provider function and CP53
validator. It is an internal server service, not a public endpoint or authentication
boundary. It defaults to disabled. No production provider is registered by CP54.

A caller must supply an authenticated owner ID from the session and an explicit
confirmation. The runner validates entry dates, loads evidence for that owner and
clones it before any provider wait, then prepares one bounded request. Only a response
passing CP53 validation can return a draft. No automatic retries occur. Disabled,
unconfigured, unconfirmed, invalid-date or pre-cancelled requests do not load evidence;
empty evidence never reaches the provider. Provider/loader exception details and raw
responses are not returned or logged.

The default deadline is 30 seconds across loading and generation, configurable from
1 ms to 60 seconds. The same AbortSignal is passed to both dependencies. Timeout or
caller cancellation returns a failure without a draft, even if a dependency ignores
the signal. Late results cannot become successful user responses. A slow evidence
loader resolving after cancellation cannot start a provider call.

One runner instance admits at most one request per owner and four active owners by
default (configurable from 1 to 16). Reuse the instance; creating it per request defeats
these guards. A cancelled/timed-out task keeps its slot until the actual dependency
settles, preventing immediate overlapping retries. If it never settles, the slot
remains occupied for that instance's lifetime. Providers/loaders must honor abort.
These guards are process-local only: they are not durable quotas, cross-instance
idempotency or a spending cap. Cancellation does not guarantee upstream billing stops.

The injected provider receives separate instructions/input, an AbortSignal and the
16 KiB output-byte ceiling. A real adapter must bound reading the upstream response,
set provider token limits, implement cancellation and normalize provider behavior;
post-response validation alone does not bound upstream cost or buffering.

Future live route/action integration must authenticate, enforce a durable spending/request
budget and get explicit invocation before calling the runner. The runner has no live
route or model UI connected. CP56's manual flow calls the validator directly and does
not invoke this runner. A provider/model and spending ceiling remain decisions.

Acceptance: `node --import tsx --test tests/review-runner.test.ts` uses simulated
providers only. It covers successful validation, gating, owner/date forwarding,
evidence snapshot isolation, safe errors, no retries, per-owner/capacity limits,
cancellation, timeout and late loader/provider settlement. No API key is needed.
