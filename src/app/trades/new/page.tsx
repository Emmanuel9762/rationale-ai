export default function NewTradePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm text-zinc-500">Trades</p>
          <h1 className="mt-1 text-2xl font-semibold">Log a trade</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Record the trade and the reasoning behind it.
          </p>
        </div>

        <form className="space-y-6">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="font-medium">Trade details</h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="symbol" className="block text-sm text-zinc-400">
                  Symbol
                </label>
                <input
                  id="symbol"
                  name="symbol"
                  type="text"
                  placeholder="XAUUSD"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="direction"
                  className="block text-sm text-zinc-400"
                >
                  Direction
                </label>
                <select
                  id="direction"
                  name="direction"
                  defaultValue=""
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                  required
                >
                  <option value="" disabled>
                    Select direction
                  </option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="entryPrice"
                  className="block text-sm text-zinc-400"
                >
                  Entry price
                </label>
                <input
                  id="entryPrice"
                  name="entryPrice"
                  type="number"
                  step="any"
                  placeholder="3400.00"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="exitPrice"
                  className="block text-sm text-zinc-400"
                >
                  Exit price
                </label>
                <input
                  id="exitPrice"
                  name="exitPrice"
                  type="number"
                  step="any"
                  placeholder="3425.00"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label
                  htmlFor="quantity"
                  className="block text-sm text-zinc-400"
                >
                  Quantity
                </label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="any"
                  placeholder="0.10"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="pnl" className="block text-sm text-zinc-400">
                  P&L
                </label>
                <input
                  id="pnl"
                  name="pnl"
                  type="number"
                  step="any"
                  placeholder="125.00"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label
                  htmlFor="entryTime"
                  className="block text-sm text-zinc-400"
                >
                  Entry time
                </label>
                <input
                  id="entryTime"
                  name="entryTime"
                  type="datetime-local"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="exitTime"
                  className="block text-sm text-zinc-400"
                >
                  Exit time
                </label>
                <input
                  id="exitTime"
                  name="exitTime"
                  type="datetime-local"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="font-medium">Trade rationale</h2>

            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="setup" className="block text-sm text-zinc-400">
                  Setup
                </label>
                <input
                  id="setup"
                  name="setup"
                  type="text"
                  placeholder="Break and retest"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </div>

              <div>
                <label
                  htmlFor="rationale"
                  className="block text-sm text-zinc-400"
                >
                  Why did you take this trade?
                </label>
                <textarea
                  id="rationale"
                  name="rationale"
                  rows={5}
                  placeholder="Explain what you saw, why you entered, and what you expected to happen."
                  className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm text-zinc-400">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  placeholder="Anything else worth recording?"
                  className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-white"
            >
              Save trade
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
