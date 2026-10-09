import "server-only";
import { redirect } from "next/navigation";
import { getAuth } from "./server";
import { authConfig } from "./config";
import { resolveSessionUser } from "./session-user";

export async function requireSession() {
  // Check the provider on every protected request, including save actions.
  const { data, error } = await getAuth().getSession({ query: { disableCookieCache: "true" } });
  const expiry = data?.session ? new Date(data.session.expiresAt).getTime() : NaN;
  if (error || !data?.user || !Number.isFinite(expiry) || expiry <= Date.now()) redirect("/sign-in");
  return data;
}

export async function requireCurrentUser() {
  const session = await requireSession();
  const { db } = await import("../../db");
  const user = await resolveSessionUser(db, {
    subject: session.user.id, issuer: authConfig().baseUrl, email: session.user.email,
  });
  if (!user) redirect("/account?link=required");
  return user;
}
