# Paper-trading CSV mapping — CP48

This is a local preview and conversion tool, not automatic trade logging.
It supports a UTF-8, comma-separated file with one row per journal trade.
It does not yet certify a TradingView or MT5 export. Order lists, individual
executions, partial closes, HTML statements and ambiguous timestamps require
a source-specific adapter. Keep using paper trading; a live broker is not needed.

## Try the included sample

1. Sign in to a test account.
2. Open Trade history → Preview CSV → Map a paper-trade CSV.
3. Download the paper-trading mapping sample on that page, choose the file in
   Paper-trade CSV and click Read columns.
4. Select these source columns:

| Journal field | Sample column |
| --- | --- |
| Symbol | Instrument |
| Direction | Side |
| Entry price | Entry |
| Quantity | Size |
| Entry time (UTC) | Opened UTC |
| Exit price | Exit |
| Exit time (UTC) | Closed UTC |
| Recorded P&L | Result |
| Setup | Idea |
| Notes | Comment |

Leave Rationale unmapped. Choose BUY / SELL under Direction values. This means
the entry side of a complete trade: BUY becomes LONG, SELL becomes SHORT.
Confirm the row/quantity/currency acknowledgement and click Validate mapping.

Expected: **3 records, 3 valid, 0 invalid, 0 repeated**. EURUSD is LONG with 2.00
recorded P&L, GBPUSD is SHORT with -2.00, and USDJPY is open without recorded P&L.
The loss's note contains a newline. External reference is shown as omitted.
These are fabricated test values, not trading recommendations or calculated
broker profit. Nothing has been saved or uploaded.

5. Click Download mapped CSV. Open Preview CSV, choose the downloaded
   rationale-paper-trades.csv, and preview again.
6. Verify the same three trades, then explicitly confirm import if desired.
   A confirmed batch should contain three trades. Use the test account so
   synthetic data does not mix with your actual paper-trading journal.

## Your acceptance checks

- Change one column after validation: the previous preview/download must disappear.
- Map Entry time to Result and unmap Recorded P&L: all three rows should fail
  date validation; no download should be offered.
- Clear mapping: source, mapping, acknowledgement and results reset.
- Preview the downloaded file without confirming: the journal count stays unchanged.
- Reconfirm the exact same downloaded batch unchanged: existing replay protection
  returns the original receipt. This is not general source-ID deduplication.
- On a narrow screen, all mapping fields remain usable and the results table
  scrolls inside its container.
- If any check fails, send the error and the step, not credentials.

## Supported values and deliberate limits

Required fields: symbol, direction, entry price, quantity and entry time.
Optional fields: exit price/time, recorded P&L, setup, rationale and notes.
Direction supports LONG/SHORT or explicit entry-side BUY/SELL, ignoring case.
UTC timestamps require seconds and an explicit Z, optionally three milliseconds:
2026-10-01T09:30:00Z or 2026-10-01T09:30:00.123Z.
There is no timezone conversion. Unknown timezone is not assumed to mean UTC.

Decimal values use a dot, without currency symbols or thousands separators.
The existing journal validator enforces positive price/quantity, precision,
closing-field pairs and chronological dates. No lot-size, P&L, commission,
currency or swap conversion is performed. A closed trade may omit P&L; an open
trade must omit exit fields and P&L. Account-currency compatibility is a user
confirmation because the current account schema has no currency metadata.

Limits: 256 KiB input, 500 non-empty data records, 32 columns, non-empty unique
header names of at most 100 characters. Conversion must also fit the existing
256 KiB import limit. Original source record numbers count the header and blank
records; quoted multiline text is one record. The downloaded file has its own
record numbering because blank records are omitted.

Exact canonical Rationale headers auto-map; other labels require explicit choices.
A source column can only map once. Unmapped source columns are listed and omitted.
No account IDs, review metadata or execution IDs are used as ownership instructions.
Formula-like text receives a protective apostrophe in both preview and download;
numeric negative amounts retain their exact sign and decimal string.

Repeated valid rows remain visible and are not removed. Existing manual trades,
overlapping files, reordered batches and altered mappings are not reconciled.
Do not repeatedly import overlapping paper histories. Source execution identity
and incremental sync remain future work.

## When you have a real platform export

Send a small sanitised sample in its original format, say whether it comes from
TradingView Paper Trading or an MT5 demo, and identify its timezone/currency if
known. Remove personal account metadata and never share passwords or tokens.
If it contains fills rather than completed trade rows, do not force it through
the mapper: that is evidence for the next source adapter.

## Developer verification

Seven new tests cover mapping, exact amounts, validation, source shape/size,
formula protection, original record numbers and unchanged strict import headers.
The production access check includes the new authenticated route. Chromium
checks map/validate/download, mobile width, stale-result invalidation, error/reset,
no POST requests or database writes, and the existing import-preview handoff.
No migration, external provider, broker credential or runtime dependency added.
