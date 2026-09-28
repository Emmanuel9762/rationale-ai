"use client";
export default function TradeError({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-zinc-950 p-10 text-zinc-100"><h1 className="text-xl">Unable to load your trades</h1><p className="my-4">Check your database connection, then try again.</p><button className="rounded bg-zinc-100 px-4 py-2 text-zinc-950" onClick={reset}>Try again</button></main>;
}
