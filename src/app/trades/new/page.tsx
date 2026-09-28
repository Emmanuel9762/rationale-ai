import { requireCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { createTrade } from "./actions";
import { TradeForm } from "../trade-form";
export const dynamic = "force-dynamic";
export default async function NewTradePage() {
  await requireCurrentUser();
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100"><div className="mx-auto max-w-3xl space-y-6"><Link href="/trades" className="text-sm underline">Trade history</Link><h1 className="text-2xl font-semibold">Log a trade</h1><TradeForm action={createTrade} submitLabel="Save trade"/></div></main>;
}
