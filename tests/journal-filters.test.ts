import assert from "node:assert/strict";
import test from "node:test";
import { parseJournalFilters, journalHref } from "../src/lib/journal-filters";

test("journal URLs normalize symbols and retain filters across pagination", () => {
  const { filters, page, errors } = parseJournalFilters({symbol:" eur/usd ",direction:"SHORT",status:"closed",from:"2024-02-29",to:"2024-03-01",page:"2"});
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
    {symbol:"x".repeat(21)}, {status:"all-users"}, {direction:"SIDEWAYS"},
    {from:"2026-02-29"}, {to:"2026-04-31"}, {from:"0000-01-01"},
    {from:"2026-02-02",to:"2026-02-01"}, {symbol:["A","B"]},
    {status:["open","closed"]}, {page:["1","2"]},
  ]) assert.ok(parseJournalFilters(params).errors.length > 0);
  assert.equal(parseJournalFilters({from:"2024-02-29",to:"2024-02-29"}).errors.length,0);
});

test("page input stays bounded and URL encoding keeps symbol text out of other filters", () => {
  for (const raw of [undefined,"0","-2","1.5","NaN","Infinity"]) assert.equal(parseJournalFilters({page:raw}).page,1);
  assert.equal(parseJournalFilters({page:"9".repeat(400)}).page,100000);
  const url = new URL(journalHref({symbol:"A&B=1"}),"https://example.test");
  assert.equal(url.searchParams.get("symbol"),"A&B=1");
  assert.equal(url.searchParams.has("B"),false);
});
