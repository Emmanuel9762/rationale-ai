import assert from "node:assert/strict";
import test from "node:test";
import { journalReturnHref, tradeContextHref } from "../src/lib/journal-navigation";
import { journalHref } from "../src/lib/journal-filters";

test("trade navigation retains canonical filters, encoded labels, batches and pages", () => {
  const destination = journalHref({import:"abcdef01-0000-4000-8000-123456789012",setup:"A&B=%_",status:"closed",review:"unreviewed",from:"2026-01-01",to:"2026-01-31"},2);
  assert.equal(journalReturnHref(destination), destination);
  for (const edit of [false,true]) {
    const url = new URL(tradeContextHref("trade-id",destination,edit),"https://example.test");
    assert.equal(url.pathname,`/trades/trade-id${edit ? "/edit" : ""}`);
    assert.equal(url.searchParams.get("returnTo"),destination);
  }
  assert.equal(journalReturnHref("/trades?symbol=eurusd&page=0002&ignored=x"),"/trades?symbol=EURUSD&page=2");
  assert.equal(tradeContextHref("trade-id"),"/trades/trade-id");
});

test("untrusted return contexts cannot introduce external paths or invalid filters", () => {
  for (const raw of [undefined,null,{},["/trades"],"https://evil.test/trades","//evil.test/trades","javascript:alert(1)","/trades/../account","/trades/export","/trades#x","/trades?x=\\evil","/trades?x=\n", "/trades?from=2026-02-30","/trades?from=2026-02-01&to=2026-01-01","/trades?symbol=A&symbol=B","/trades?page=1&page=2","/trades?status=open&outcome=win","/trades?setup="+"a".repeat(3000)]) {
    assert.equal(journalReturnHref(raw),"/trades");
    assert.equal(tradeContextHref("trade-id",raw),"/trades/trade-id");
  }
  assert.equal(journalReturnHref("/trades?returnTo=https://evil.test"),"/trades");
});
