import "server-only";
import { redirect } from "next/navigation";
import { resolveDevelopmentUser } from "./development-user";

// Every protected page and Server Action must call this itself.
// A future session provider belongs here; never accept identity from FormData.
export async function requireCurrentUser() {
  if (process.env.NODE_ENV !== "development") redirect("/sign-in");
  const { db } = await import("../../db");
  const user = await resolveDevelopmentUser(db, process.env.NODE_ENV);
  if (!user) redirect("/sign-in");
  return user;
}
