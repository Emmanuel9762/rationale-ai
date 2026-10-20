# Journal visual conventions

Use `JournalShell` for authenticated pages and `AuthShell` for sign-in, recovery
and verification. `JournalHeader` owns the eyebrow, title and description rhythm.
The shared navigation marks the page's section; trade details and CSV tools belong
to Trade history. Preserve contextual return links inside the shared frame.

The palette lives in `src/app/globals.css`. Tailwind's semantic color utilities
(`bg-canvas`, `bg-panel`, `text-muted`, `border-line`, `text-accent`) reference those
same CSS variables. Change a token here rather than introducing another route's
hard-coded palette. Blue indicates navigation, selection and primary actions.
Green/red still indicate positive/negative P&L; amber indicates pending work.

Use `journal-primary`, `journal-secondary`, `journal-field` and
`journal-detail-section` for shared controls and panels. Use `journal-panel` for
compact supporting content. Primary controls have a 44px minimum height, visible
keyboard focus and a disabled state. Every page's main element is the skip-link
target. Keep labels, error messages and accessible names tied to their controls.

Use the wide shell for tables and reports, `narrow` for focused account/trade
forms. Dense tables scroll inside their own region; the trade ledger becomes
cards on mobile without dropping fields. Supporting methodology can live in a
native details disclosure, preserving the complete explanation.

`npm run test:browser` covers the real forms and navigation using synthetic
Auth/Postgres fixtures. Its shared-frame sweep checks active navigation and
document overflow on 16 routes at 320px and 1440px, plus skip-link and field focus.
Set `JOURNAL_SCREENSHOTS` to a local path prefix to capture those views. CI saves
the fixture screenshots as the `journal-ui` artifact for seven days.
