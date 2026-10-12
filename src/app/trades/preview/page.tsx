import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import CsvPreviewForm from "./preview-form";

export const dynamic = "force-dynamic";

export default async function CsvPreviewPage() {
  await requireCurrentUser();
  return <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex gap-5 text-sm"><Link href="/trades">Trade history</Link><Link href="/performance">Performance</Link></nav>
      <header><h1 className="text-2xl font-semibold">Preview trade CSV</h1><p className="mt-2 text-zinc-400">Preview a file, fix any invalid records, then confirm to save the whole batch. Preview alone never saves trades.</p></header>
      <CsvPreviewForm />
    </div>
  </main>;
}
