import assert from "node:assert/strict";
import test from "node:test";
import { breakdownJournalHref, parseJournalFilters, journalHref } from "../src/lib/journal-filters";
import { PLAN_ADHERENCE_LABELS } from "../src/lib/plan-adherence";

test("journal URLs normalize symbols and retain filters across pagination", () => {
  const { filters, page, errors } = parseJournalFilters({symbol:" eur/usd ",direction:"SHORT",status:"closed",review:"unreviewed",from:"2024-02-29",to:"2024-03-01",page:"2"});
  assert.deepEqual(errors, []);
  assert.equal(page, 2);
  assert.equal(filters.symbol, "EUR/USD");
  const next = new URL(journalHref(filters, 3), "https://example.test");
  assert.equal(next.searchParams.get("symbol"), "EUR/USD");
  assert.equal(next.searchParams.get("status"), "closed");
  assert.deepEqual(parseJournalFilters(Object.fromEntries(next.searchParams)).filters, filters);
  assert.equal(new URL(journalHref(filters),next).searchParams.has("page"),false);
  assert.equal(journalHref({}),"/trades");
});

test("invalid and ambiguous filters are reported instead of silently broadening the journal", () => {
  for (const params of [
    {import:"bad"}, {import:["a","b"]}, {adherence:"unknown"}, {adherence:["followed","partly"]}, {adherence:"toString"},
    {setup:"x".repeat(101)}, {setup:["A","B"]}, {missing:["setup","symbol"]},
    {missing:"other"}, {missing:"setup",setup:"Breakout"}, {missing:"symbol",symbol:"EURUSD"},
    {review:"invalid"}, {review:["reviewed","unreviewed"]}, {symbol:"x".repeat(21)}, {status:"all-users"}, {direction:"SIDEWAYS"},
    {from:"2026-02-29"}, {to:"2026-04-31"}, {from:"0000-01-01"},
    {from:"2026-02-02",to:"2026-02-01"}, {symbol:["A","B"]},
    {status:["open","closed"]}, {page:["1","2"]},
  ]) assert.ok(parseJournalFilters(params).errors.length > 0);
  assert.equal(parseJournalFilters({from:"2024-02-29",to:"2024-02-29"}).errors.length,0);
});

test("breakdown links round-trip literal and missing labels with dates and pagination", () => {
  const period = {from:"2026-01-01",to:"2026-01-31"};
  for (const adherence of Object.keys(PLAN_ADHERENCE_LABELS)) {
    const url=new URL(breakdownJournalHref("adherence",adherence,period),"https://example.test");
    const parsed=parseJournalFilters(Object.fromEntries(url.searchParams));
    assert.deepEqual(parsed.errors,[]);assert.equal(parsed.filters.adherence,adherence);
    const next=new URL(journalHref(parsed.filters,2),url);
    assert.deepEqual(parseJournalFilters(Object.fromEntries(next.searchParams)).filters,parsed.filters);
    assert.equal(next.searchParams.get("from"),period.from);assert.equal(next.searchParams.get("to"),period.to);
  }
  for (const by of ["setup","symbol"] as const) {
    for (const group of [null,"Not specified","A&B=%_","\tLABEL\t"]) {
      const url = new URL(breakdownJournalHref(by,group,period),"https://example.test");
      const parsed = parseJournalFilters(Object.fromEntries(url.searchParams));
      assert.deepEqual(parsed.errors,[]);
      assert.deepEqual(parsed.filters,{...period,...(group === null ? {missing:by} : {[by]:by === "symbol" ? group.toUpperCase() : group})});
      const next = new URL(journalHref(parsed.filters,2),url);
      assert.deepEqual(parseJournalFilters(Object.fromEntries(next.searchParams)).filters,parsed.filters);
      assert.equal(url.searchParams.has("page"),false);
    }
  }
});

test("page input stays bounded and URL encoding keeps symbol text out of other filters", () => {
  for (const raw of [undefined,"0","-2","1.5","NaN","Infinity"]) assert.equal(parseJournalFilters({page:raw}).page,1);
  assert.equal(parseJournalFilters({page:"9".repeat(400)}).page,100000);
  const url = new URL(journalHref({symbol:"A&B=1"}),"https://example.test");
  assert.equal(url.searchParams.get("symbol"),"A&B=1");
  assert.equal(url.searchParams.has("B"),false);
});

test("batch filters validate UUIDs and survive filtering, pagination and export URLs", () => {
  const id="ABCDEF01-0000-4000-8000-123456789012";
  const parsed=parseJournalFilters({import:id,status:"closed"});
  assert.deepEqual(parsed.errors,[]);assert.equal(parsed.filters.import,id.toLowerCase());
  const url=new URL(journalHref(parsed.filters,2),"https://example.test");
  assert.equal(url.searchParams.get("import"),id.toLowerCase());
  assert.deepEqual(parseJournalFilters(Object.fromEntries(url.searchParams)).filters,parsed.filters);
});

test("recorded outcomes round-trip and reject invalid, repeated or open-only combinations", () => {
  for (const outcome of ["win","loss","breakeven","measured","missing"]) {
    const parsed=parseJournalFilters({outcome,review:"unreviewed",from:"2026-01-01"});
    assert.deepEqual(parsed.errors,[]);
    const url=new URL(journalHref(parsed.filters,2),"https://example.test");
    assert.equal(url.searchParams.get("outcome"),outcome);
    assert.deepEqual(parseJournalFilters(Object.fromEntries(url.searchParams)).filters,parsed.filters);
    assert.ok(parseJournalFilters({outcome,status:"open"}).errors.length);
  }
  for (const outcome of ["unknown","toString",["win","loss"]]) assert.ok(parseJournalFilters({outcome}).errors.length);
});
