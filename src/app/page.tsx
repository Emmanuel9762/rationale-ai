const stats = [
  { label: "Total P&L", value: "$0.00" },
  { label: "Win Rate", value: "0%" },
  { label: "Profit Factor", value: "0.00" },
  { label: "Trades", value: "0" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-zinc-800 bg-zinc-950 p-5 md:block">
          <div className="mb-10">
            <h1 className="text-xl font-semibold">RationaleAI</h1>
            <p className="mt-1 text-xs text-zinc-500">Trading intelligence</p>
          </div>

          <nav className="space-y-1">
            <a
              href="#"
              className="block rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium"
            >
              Dashboard
            </a>
            <a
              href="#"
              className="block rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Trades
            </a>
            <a
              href="#"
              className="block rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Journal
            </a>
            <a
              href="#"
              className="block rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Insights
            </a>
          </nav>
        </aside>

        <section className="flex-1">
          <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-6">
            <div>
              <p className="text-sm text-zinc-500">Overview</p>
              <h2 className="text-lg font-semibold">Trading Dashboard</h2>
            </div>

            <a
              href="/trades/new"
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
            >
              Log Trade
            </a>
          </header>

          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
                >
                  <p className="text-sm text-zinc-500">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="min-h-80 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-2">
                <h3 className="font-medium">Performance</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Your trading performance will appear here.
                </p>
              </div>

              <div className="min-h-80 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="font-medium">AI Insights</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  RationaleAI will surface patterns in your trading here.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
