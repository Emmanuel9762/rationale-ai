# Review evidence — CP51–52

Open **Review evidence for these dates** from Dashboard or Performance, or
**Review evidence** from the journal. This page helps you inspect what has actually
been recorded before asking AI to interpret it. It does not call a model, generate
advice or incur API charges.

## What you see

- Up to 100 of your newest matching trades, by UTC entry time then trade ID.
- Counts for included trades, open/incomplete trades, closed measured/unmeasured
  trades, marked-reviewed entries, missing rationale/setup and absent review notes.
- Exact recorded P&L for included closed trades with P&L. Missing results are
  excluded; no measured results shows Not available rather than zero.
- Expandable evidence and links to the original trade for editing/review.

Every count and total covers only the included snapshot. If more than 100 trades
match, a partial-snapshot notice appears: narrow the entry dates to inspect older
entries. A blank date boundary is unrestricted; both selected UTC days are included.
All your accounts are included, assuming their recorded amounts share one currency.
Other journal filters do not apply here.

Rationale, notes and each review narrative are limited to 500 Unicode characters.
Shortened fields are identified; the original trade retains its full text. No trade
is edited by viewing this page. The snapshot omits account identifiers, emails and
submission metadata; trade IDs/revisions are retained for evidence traceability.

## Your acceptance checks

1. On Performance, choose a period containing your sample trades. Open Review
   evidence for these dates: both date bounds should carry across.
2. Expand Read evidence. Compare a trade's rationale, notes, prices and recorded
   outcome with its original detail page via Open trade. Back to trades returns
   to the matching date-filtered journal.
3. Leave one rationale or review narrative empty and reload the evidence page.
   Check the corresponding missing-data count. A saved review and written review
   notes are counted separately.
4. Select a period without trades: expect the empty state. Reverse the dates:
   expect a date error and no trade evidence. All time restores an unrestricted view.
5. On mobile, expand evidence and use the links without horizontal page scrolling.
6. If your period contains over 100 trades, expect the partial-snapshot notice.
   Counts and P&L are for those newest 100 only, not the whole period.

## Manual review (CP56)

Expand **Review this evidence with an external model** to download a private JSON
packet, then paste a model's JSON reply for snapshot/reference validation and an
escaped, cited draft display. Sharing the packet is your choice outside Rationale;
the app makes no model call or journal write. [MANUAL_REVIEW.md](MANUAL_REVIEW.md)
provides the steps and limitations. AI_REVIEW_CONTRACT.md defines the response.

## What comes next

This establishes an inspectable input for a future on-demand AI review. It is not
an AI verdict, quality score or proof of a trading edge. Notes can be retrospective;
trade edits do not clear existing reviews. Structured pre-trade stops, targets and
risk rules are not captured yet and must not be inferred from missing evidence.

A live AI checkpoint needs an agreed provider/model, spend limit and explicit
request before sending journal text. The provider boundary will need output and
trade-reference validation, timeout/quota handling and prompt-injection tests.
Do not send this snapshot to a model automatically. A platform-specific importer
still needs a sanitised real export; it is a separate workstream.
