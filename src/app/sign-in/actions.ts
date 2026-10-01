"use server";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";

export type AuthState = { error: string; notice?: string };
async function authenticate(mode: "sign-in" | "sign-up", _previous: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || password.length < 8 || password.length > 128 || (mode === "sign-up" && (!name || name.length > 100))) {
    return { error: "Enter a valid email and a password of 8–128 characters. Registration also requires your name." };
  }
  try {
    const auth = getAuth();
    const result = mode === "sign-up" ? await auth.signUp.email({ email, password, name }) : await auth.signIn.email({ email, password });
    if (result.error?.code === "EMAIL_NOT_VERIFIED") return { error: "Verify your email before signing in. Use the verification link below to enter or resend a code." };
    if (result.error) return { error: mode === "sign-in" ? "Sign-in failed. Check your details and try again." : "Could not create the account. Try signing in if you already registered." };
    if (mode === "sign-up" && !result.data?.token) return { error: "", notice: "Check your email to verify your account, then sign in." };
  } catch {
    return { error: "Authentication is unavailable. Please try again shortly." };
  }
  redirect("/account");
}
export async function signOut() {
  const { error } = await getAuth().signOut();
  if (error) throw new Error("Sign-out could not be confirmed. Please try again.");
  redirect("/sign-in");
}

export async function signIn(previous: AuthState, form: FormData) {
  return authenticate("sign-in", previous, form);
}
export async function signUp(previous: AuthState, form: FormData) {
  return authenticate("sign-up", previous, form);
}
