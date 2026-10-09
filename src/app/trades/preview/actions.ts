"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { CsvPreviewError } from "@/lib/trade-csv-preview";
import { importOwnedCsv, type ImportState } from "@/lib/trade-import";

export async function importTradeCsv(data: FormData): Promise<ImportState> {
  const user = await requireCurrentUser();
  try {
    const receipt = await importOwnedCsv(db, user.id, data);
    revalidatePath("/");
    revalidatePath("/trades");
    revalidatePath("/performance");
    revalidatePath("/trades/imports");
    return { receipt };
  } catch (error) {
    return { error: error instanceof CsvPreviewError ? error.message : "Could not confirm the import. Retry the same file unchanged to recover its receipt without adding the batch again." };
  }
}
