"use client";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-zinc-950 p-10 text-zinc-100"><h1 className="text-xl">Dashboard unavailable</h1><p className="my-4">Could not load the database. Your metrics have not been replaced with zeroes.</p><button onClick={reset} className="rounded bg-zinc-100 px-4 py-2 text-zinc-950">Try again</button></main>;
}
