import type { buildReviewEvidence } from "./review-evidence";
import { parseJournalFilters, type JournalSearchParams } from "./journal-filters";
import { prepareReviewRequest, validateReviewResponse, REVIEW_OUTPUT_MAX_BYTES } from "./review-response";

type Evidence = ReturnType<typeof buildReviewEvidence>;
type Draft = ReturnType<typeof validateReviewResponse>;
export type ReviewProvider = (request: ReturnType<typeof prepareReviewRequest> & {
  signal: AbortSignal; maxOutputBytes: number;
}) => Promise<string>;
type EvidenceLoader = (userId: string, period: {from?:string;to?:string}, signal: AbortSignal) => Promise<Evidence>;
const messages = {
  disabled:"AI review is not enabled.",
  unauthenticated:"Sign in before requesting a review.",
  confirmation_required:"Confirm that you want to send this period's journal evidence for review.",
  unavailable:"The review provider is not configured.",
  invalid_dates:"Check the entry dates before requesting a review.",
  busy:"A review for you is still running. Wait before requesting another.",
  capacity:"Review capacity is full. Try again later.",
  cancelled:"Review cancelled. No draft was returned.",
  timeout:"Review timed out. No draft was returned.",
  evidence_unavailable:"Could not load your journal evidence. No review was requested.",
  invalid_evidence:"Evidence is empty or too large. Check your trades and narrow the dates.",
  provider_failed:"The review provider could not complete this request. No draft was returned.",
  invalid_response:"The review did not pass validation. No draft was returned.",
} as const;
type FailureCode = keyof typeof messages;
export type ReviewRunResult = {ok:true;draft:Draft} | {ok:false;code:FailureCode;message:string};
const fail = (code:FailureCode): ReviewRunResult => ({ok:false,code,message:messages[code]});

// Internal server service, NOT an authentication boundary. The route/action must
// supply its authenticated user ID and enforce durable quota before calling run.
export function createReviewRunner(options: {
  loadEvidence: EvidenceLoader; provider?: ReviewProvider; enabled?: boolean;
  timeoutMs?: number; maxConcurrent?: number;
}) {
  const {loadEvidence,provider,enabled=false,timeoutMs=30_000,maxConcurrent=4} = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 ||
      !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 16) {
    throw new Error("Invalid review runner limits.");
  }
  // Process-local protection only; not a distributed quota or billing guarantee.
  const active = new Set<string>();
  return {
    async run(input: {userId:string;params?:JournalSearchParams;confirmed:boolean;signal?:AbortSignal}): Promise<ReviewRunResult> {
      if (enabled !== true) return fail("disabled");
      if (!input.userId?.trim()) return fail("unauthenticated");
      if (input.confirmed !== true) return fail("confirmation_required");
      if (!provider) return fail("unavailable");
      const {filters:period,errors} = parseJournalFilters({from:input.params?.from,to:input.params?.to});
      if (errors.length) return fail("invalid_dates");
      if (input.signal?.aborted) return fail("cancelled");
      if (active.has(input.userId)) return fail("busy");
      if (active.size >= maxConcurrent) return fail("capacity");
      active.add(input.userId);

      const controller = new AbortController();
      let stopCode: "cancelled" | "timeout" = "cancelled";
      let stop!: (code: "cancelled" | "timeout") => void;
      const stopped = new Promise<ReviewRunResult>(resolve => {
        stop = code => {
          if (controller.signal.aborted) return;
          stopCode = code;
          // Resolve first so even a cooperative provider's rejection cannot mask cancellation.
          resolve(fail(code)); controller.abort();
        };
      });
      const cancel = () => stop("cancelled");
      input.signal?.addEventListener("abort",cancel,{once:true});
      const timer = setTimeout(()=>stop("timeout"),timeoutMs);
      const task = (async (): Promise<ReviewRunResult> => {
        let evidence: Evidence;
        try { evidence = structuredClone(await loadEvidence(input.userId,period,controller.signal)); }
        catch { return controller.signal.aborted ? fail(stopCode) : fail("evidence_unavailable"); }
        if (controller.signal.aborted) return fail(stopCode);
        let request: ReturnType<typeof prepareReviewRequest>;
        try { request = prepareReviewRequest(evidence); }
        catch { return fail("invalid_evidence"); }
        let raw: string;
        try { raw = await provider({...request,signal:controller.signal,maxOutputBytes:REVIEW_OUTPUT_MAX_BYTES}); }
        catch { return controller.signal.aborted ? fail(stopCode) : fail("provider_failed"); }
        if (controller.signal.aborted) return fail(stopCode);
        try { return {ok:true,draft:validateReviewResponse(raw,evidence)}; }
        catch { return fail("invalid_response"); }
      })();
      // Keep the slot until actual settlement if a dependency ignores abort.
      // Otherwise a timeout followed by retry could launch duplicate paid work.
      void task.then(()=>active.delete(input.userId));
      try { return await Promise.race([task,stopped]); }
      finally { clearTimeout(timer); input.signal?.removeEventListener("abort",cancel); }
    },
  };
}
