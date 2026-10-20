import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  ["dashboard", "/", "Dashboard"],
  ["journal", "/trades", "Trade history"],
  ["performance", "/performance", "Performance"],
  ["evidence", "/review-evidence", "Review evidence"],
  ["account", "/account", "Account"],
] as const;
type Section = typeof navigation[number][0];

export function JournalBrand() {
  return <Link className="journal-brand" href="/" aria-label="RationaleAI home">Rationale<span>AI</span></Link>;
}

export function JournalShell({ active, narrow = false, children }: { active: Section; narrow?: boolean; children: ReactNode }) {
  return <main id="main-content" tabIndex={-1} className="journal-shell min-h-screen text-ink">
    <div className="mx-auto max-w-6xl">
      <nav className="journal-nav" aria-label="Main navigation">
        <JournalBrand />
        <div className="journal-nav-links">{navigation.map(([section, href, label]) => <Link key={section} href={href} aria-current={active === section ? "page" : undefined}>{label}</Link>)}</div>
      </nav>
      <div className={`journal-content space-y-6${narrow ? " mx-auto max-w-3xl" : ""}`}>{children}</div>
    </div>
  </main>;
}

export function JournalHeader({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return <header className="journal-heading">
    <div className="min-w-0"><p className="journal-eyebrow">{eyebrow}</p><h1>{title}</h1>{children && <div className="mt-3 max-w-3xl text-muted">{children}</div>}</div>
    {actions}
  </header>;
}

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return <main id="main-content" tabIndex={-1} className="journal-auth min-h-screen text-ink">
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8"><JournalBrand /><p className="mt-2 text-sm text-muted">Observe. Reflect. Improve.</p></div>
      <div className="journal-detail-section space-y-6"><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{children}</div>
    </div>
  </main>;
}
