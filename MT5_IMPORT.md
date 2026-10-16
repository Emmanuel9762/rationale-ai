# MT5 trade ingestion contract

Status: proposed design, prepared in CP47. No MT5 parser, account connection,
automatic logging or source-schema migration has been implemented. The supported
import today is still Rationale's own CSV format. Do not upload an arbitrary MT5
report expecting it to be understood.

## First useful increment

Support one real MT5 demo-history format from the user's chosen broker. Preview
the source, identify unsupported rows, show reconciliation totals and confirm an
owner-scoped import. Prove repeat/overlap safety before adding Sync now or a
background connector. TradingView is initially a chart-analysis companion.
TradingView Paper Trading is a separate execution source and must not be mixed
with an MT5 account.

The first format must be selected from an actual sample, not guessed CSV headers.
If the export does not contain enough execution identity or financial detail,
document the limitation and obtain a richer report or use the terminal API.
Do not reconstruct missing fills from screenshots or chart alerts.

## Sample needed for the next checkpoint

Provide one small export of MT5 demo account history in the format the terminal
actually produces. Keep the original extension and column names. Tell us:

- Broker/server name and terminal version/platform (desktop, web or mobile).
- Demo versus live account, account currency and reporting period.
- Whether the report shows deals, orders, positions, or a mixture.
- The report's time-zone basis, if known; unknown is a blocker to UTC conversion.

Prefer a new demo account containing a simple completed trade and, if available,
a partial close. One incomplete sample can establish format support; it cannot
prove support for every account mode.

Remove names, emails, actual login/account numbers and other personal metadata.
Use consistent replacements for identifiers so relationships remain testable;
retain field names, sample amounts/times and relationships between deal, order
and position identifiers. Never send passwords, investor passwords, API keys,
session cookies or recovery codes. Keep the original privately so that source
totals can be compared with the sanitised fixture.

## Data boundary

The existing journal trade is one entry/exit record with a single quantity and
P&L amount. A source execution is not necessarily a complete journal trade.
Do not squeeze multiple entries/exits into that representation without an
explicit aggregation rule.

Proposed persisted model (subject to the real sample and a separate migration):
- A source-account mapping bound to the authenticated owner and a local account.
  Provider, broker/server and external account identity distinguish accounts;
  never trust a submitted local user/account ID.
- Immutable source executions with an external execution ID, source order and
  position references where supplied, original timestamp/time-zone metadata,
  normalised UTC time, symbol, action, entry/exit classification, volume/unit,
  price, currency and separate profit/commission/fee/swap components.
- Versioned import runs with source format, file hash, coverage bounds, counts,
  warnings and reconciliation status. Keep financial evidence needed to explain
  the import; do not retain unrelated report metadata.
- Links from executions to derived journal records, keeping source-owned
  execution facts separate from user-owned rationale, setup and review fields.

A database unique constraint must protect owner/source-account/execution identity.
Use identifiers as strings; do not coerce large external tickets to JavaScript
Number. File hashes are audit/replay metadata, not the identity of a fill.

## Non-negotiable behaviour

1. The same source execution imported twice is a no-op, even when the file order
   changes or another file partly overlaps it. Same identity with changed values
   becomes a visible correction/conflict, not another execution or silent overwrite.
2. Two owners/accounts with identical source ticket numbers stay independent.
3. Partial fills, partial exits, reversals and hedging/netting need explicit tested
   rules. Unsupported patterns are blocked or clearly excluded before confirmation,
   never silently approximated.
4. Store monetary/quantity values as exact decimals. Preserve source units; MT5
   volume must not automatically be treated as the journal's generic quantity.
   Do not derive P&L from price changes without instrument contract information.
5. Declare gross versus net P&L and component signs. Avoid adding commission/swap
   twice when a report total already includes them. Never mix account currencies.
6. Deposits, withdrawals, credits and balance adjustments are not journal trades.
   Identify them for reconciliation and exclude them from trading statistics.
7. Missing timezone, ambiguous number formatting, insufficient identity or
   unsupported report versions produce actionable errors rather than guesses.
8. Preview reports source rows, executions, derived trades, duplicates, conflicts,
   exclusions and financial totals separately. Empty input is an empty result.
9. Atomic/idempotent confirmation must survive lost responses and concurrent
   retries. Do not assume multiple neon-http calls form one transaction.
10. Source refreshes must preserve rationale, notes, setup and review content.
    Changing execution facts must participate in existing revision/conflict rules.
11. Existing manually entered or generic-CSV trades may describe the same fills.
    Do not fuzzy-merge or silently duplicate them. The initial pilot should use
    an empty dedicated test account; matching existing journals needs a separate
    explicit reconciliation workflow.
12. No trading/order-placement capability is required. A later connector should
    use supported read-only access, bounded backfill and resumable checkpoints.
    Credentials remain outside source control, logs and documentation.

## Acceptance matrix for the implementation

| Case | Expected result |
| --- | --- |
| Simple open/close | Source and journal totals agree under the documented mapping |
| Reordered/repeated file | No new executions or trades |
| Overlapping histories | Only unseen executions are added |
| Same ID, different values | Explicit conflict/correction workflow |
| Identical IDs on another owner/account | Independent data and strict isolation |
| Partial close and multiple fills | No lost volume or double-counted profit |
| Netting reversal or hedged positions | Correct mapping or explicit unsupported error |
| Commission/swap/fee records | Exact declared net/gross reconciliation |
| Deposit/withdrawal | Not counted as a trade |
| Missing identity/timezone/currency | Blocking explanation before writes |
| Existing user review | Preserved after execution refresh |
| Lost confirmation response/concurrent retry | One committed result |
| Unsupported/malformed/oversized report | No partial or ambiguous import |

## Proposed sequence

- CP47: consolidate the working journal and record this ingestion contract.
- CP48: inspect the real sample; implement a bounded source preview/normaliser
  and test fixtures for the supported format. If required evidence is missing,
  report the exact gap rather than shipping a guessed mapping.
- CP49: execution identity, migration rehearsal and confirmed idempotent import,
  with reconciliation and owner-isolation tests.
- Later: select an MT5 connector architecture appropriate to the actual terminal,
  operating system and supported read-only access; add Sync now, backfill,
  recovery and then scheduled sync.
- AI: consume the verified journal and human reasoning after reliable capture.

These are proposed scopes, not fixed dates. A source-specific implementation
estimate depends on sample completeness, account mode and connector requirements.
The earlier AI-only estimate does not include MT5 integration.

## Reference

MetaQuotes documents historical deal retrieval through a connected MT5 terminal:
https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py

This establishes an available retrieval interface, not compatibility with a
particular broker export or a ready-to-deploy Linux/web connector.
