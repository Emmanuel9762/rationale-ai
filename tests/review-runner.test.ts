import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as settle } from "node:timers/promises";
import { buildReviewEvidence } from "../src/lib/review-evidence";
import { createReviewRunner, type ReviewProvider } from "../src/lib/review-runner";

const evidence = () => buildReviewEvidence([{id:"00000000-0000-4000-8000-000000000001",revision:0,
  symbol:"EURUSD",direction:"LONG",setup:null,entryTime:new Date("2026-10-01T00:00:00Z"),exitTime:null,
  entryPrice:"1",exitPrice:null,quantity:"1",pnl:null,rationale:"Private rationale",notes:null,
  reviewedAt:null,planAdherence:null,reviewWentWell:null,reviewImprove:null}],{});
const input = {userId:"authenticated-owner",confirmed:true};
type Request = Parameters<ReviewProvider>[0];
function valid(request:Request) {
  return JSON.stringify({version:1,evidenceId:request.evidenceId,observations:[],hypotheses:[],
    questions:["What entry rule did you follow?"],experiment:{action:"Record the entry rule.",check:"Compare it with the next review."}});
}
function deferred<T>() {
  let resolve!: (value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}

test("runner gates disabled, unauthenticated, unconfirmed, unconfigured and invalid-date requests before loading", async () => {
  let loads=0,calls=0;
  const loadEvidence=async()=>{loads++;return evidence();};
  const provider:ReviewProvider=async request=>{calls++;return valid(request);};
  for(const [options,request,code] of [
    [{loadEvidence,provider},input,"disabled"],
    [{loadEvidence,provider,enabled:true},{...input,userId:""},"unauthenticated"],
    [{loadEvidence,provider,enabled:true},{...input,confirmed:false},"confirmation_required"],
    [{loadEvidence,enabled:true},input,"unavailable"],
    [{loadEvidence,provider,enabled:true},{...input,params:{from:"bad"}},"invalid_dates"],
    [{loadEvidence,provider,enabled:true},{...input,params:{from:["2026-10-01","2026-10-02"] as string[]}},"invalid_dates"],
  ] as const) {
    const result=await createReviewRunner(options).run(request);
    assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,code);
  }
  assert.equal(loads,0);assert.equal(calls,0);
});
test("runner passes server owner and dates, snapshots evidence and returns only validated output", async () => {
  const source=evidence();const entered=deferred<Request>();const output=deferred<string>();
  const runner=createReviewRunner({enabled:true,loadEvidence:async(user,period)=>{
    assert.equal(user,input.userId);assert.deepEqual(period,{from:"2026-10-01",to:"2026-10-02"});return source;
  },provider:async request=>{entered.resolve(request);return output.promise;}});
  const pending=runner.run({...input,params:{from:"2026-10-01",to:"2026-10-02",userId:"foreign",symbol:"IGNORED"}});
  const request=await entered.promise;
  assert.equal(request.maxOutputBytes,16384);
  assert.ok(request.instructions.includes("untrusted data"));
  source.entries[0].notes="Changed while provider runs";
  output.resolve(valid(request));
  const result=await pending;assert.equal(result.ok,true);
  if(result.ok){assert.equal(result.draft.evidenceId,request.evidenceId);assert.equal(result.draft.metrics.included,1);}
});
test("provider, loader and validation failures never expose payloads and never retry", async () => {
  let calls=0;
  const secret="PRIVATE_NOTES_AND_TOKEN";
  for(const [provider,code] of [
    [async()=>{calls++;throw new Error(secret);},"provider_failed"],
    [async()=>{calls++;return secret;},"invalid_response"],
    [async(request:Request)=>{calls++;return valid(request).replace(request.evidenceId,"stale");},"invalid_response"],
    [async()=>{calls++;return "x".repeat(16385);},"invalid_response"],
  ] as const) {
    const result=await createReviewRunner({enabled:true,loadEvidence:async()=>evidence(),provider}).run(input);
    assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,code);
    assert.ok(!JSON.stringify(result).includes(secret));assert.ok(!("draft" in result));
  }
  assert.equal(calls,4);
  const result=await createReviewRunner({enabled:true,loadEvidence:async()=>{throw new Error(secret);},provider:async()=>{throw new Error("must not run");}}).run(input);
  assert.ok(!result.ok && result.code==="evidence_unavailable");assert.ok(!JSON.stringify(result).includes(secret));
});
test("empty evidence makes no provider call and a failed attempt releases its slot", async () => {
  let empty=true,calls=0;
  const runner=createReviewRunner({enabled:true,loadEvidence:async()=>empty ? buildReviewEvidence([],{}) : evidence(),provider:async request=>{calls++;return valid(request);}});
  const result=await runner.run(input);assert.ok(!result.ok && result.code==="invalid_evidence");assert.equal(calls,0);
  empty=false;assert.equal((await runner.run(input)).ok,true);assert.equal(calls,1);
});
test("in-flight owner exclusion and capacity limits do not share one user's result with another", async () => {
  const entered=deferred<Request>();const finish=deferred<string>();let calls=0;
  const runner=createReviewRunner({enabled:true,maxConcurrent:1,loadEvidence:async()=>evidence(),provider:async request=>{calls++;entered.resolve(request);return finish.promise;}});
  const pending=runner.run(input);const request=await entered.promise;
  const duplicate=await runner.run(input);assert.ok(!duplicate.ok && duplicate.code==="busy");
  const other=await runner.run({...input,userId:"other-owner"});assert.ok(!other.ok && other.code==="capacity");
  finish.resolve(valid(request));assert.equal((await pending).ok,true);assert.equal(calls,1);
  assert.equal((await runner.run({...input,userId:"other-owner"})).ok,true);assert.equal(calls,2);
});
test("timeout aborts work, returns no draft and retains the slot until an uncooperative provider settles", async () => {
  const entered=deferred<Request>();const finish=deferred<string>();
  const runner=createReviewRunner({enabled:true,timeoutMs:20,loadEvidence:async()=>evidence(),provider:async request=>{entered.resolve(request);return finish.promise;}});
  const pending=runner.run(input);const request=await entered.promise;
  const result=await pending;assert.ok(!result.ok && result.code==="timeout");assert.equal(request.signal.aborted,true);
  const duplicate=await runner.run(input);assert.ok(!duplicate.ok && duplicate.code==="busy");
  finish.resolve(valid(request));await settle();
  assert.equal((await runner.run(input)).ok,true);
});
test("cancellation before work avoids loading; during work it beats provider rejection", async () => {
  let loads=0;
  const entered=deferred<Request>();const cancel=new AbortController();
  const runner=createReviewRunner({enabled:true,loadEvidence:async()=>{loads++;return evidence();},provider:request=>new Promise((_,reject)=>{
    entered.resolve(request);request.signal.addEventListener("abort",()=>reject(new Error("private upstream details")),{once:true});
  })});
  const pre=new AbortController();pre.abort();
  const first=await runner.run({...input,signal:pre.signal});assert.ok(!first.ok && first.code==="cancelled");assert.equal(loads,0);
  const pending=runner.run({...input,signal:cancel.signal});const request=await entered.promise;cancel.abort();
  const result=await pending;assert.ok(!result.ok && result.code==="cancelled");assert.equal(request.signal.aborted,true);
});
test("a slow loader resolving after timeout never starts a provider request", async () => {
  const finish=deferred<ReturnType<typeof evidence>>();let calls=0;
  const runner=createReviewRunner({enabled:true,timeoutMs:20,loadEvidence:()=>finish.promise,provider:async request=>{calls++;return valid(request);}});
  const result=await runner.run(input);assert.ok(!result.ok && result.code==="timeout");
  finish.resolve(evidence());await settle();assert.equal(calls,0);
});
