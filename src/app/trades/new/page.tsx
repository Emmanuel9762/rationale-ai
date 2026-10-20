import { JournalShell, JournalHeader } from "@/app/journal-shell";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createTrade } from "./actions";
import { TradeForm } from "../trade-form";
export const dynamic = "force-dynamic";
export default async function NewTradePage() {
  await requireCurrentUser();
  return <JournalShell active="journal" narrow><JournalHeader eyebrow="Capture your decision" title="Log a trade"/><TradeForm submissionKey={randomUUID()} action={createTrade} submitLabel="Save trade"/></JournalShell>;
}
