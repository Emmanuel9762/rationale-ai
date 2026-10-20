import Link from "next/link";
import { entryDatePresets } from "@/lib/entry-date-presets";
import type { EntryPeriod } from "@/lib/entry-period";

export function EntryDatePresets({ pathname, period }: { pathname: "/" | "/performance"; period: EntryPeriod }) {
  return <div className="space-y-2">
    <nav aria-label="Quick entry dates" className="flex flex-wrap gap-3">
      {entryDatePresets(new Date()).map(({ label, from, to }) => <Link
        key={label}
        href={pathname + "?" + new URLSearchParams({ from, to })}
        aria-current={period.from === from && period.to === to ? "true" : undefined}
        className="rounded-lg border border-input px-3 py-2 text-sm aria-[current=true]:bg-accent-soft"
      >{label}</Link>)}
    </nav>
    <p className="text-sm text-muted">UTC entry dates. Rolling ranges include today; this month runs through today, which is still in progress. Links save explicit dates.</p>
  </div>;
}
