"use server";
import { getAuth } from "@/lib/auth/server";
import { appOrigin } from "@/lib/auth/app-origin";
import { revalidatePath } from "next/cache";

export type RecoveryState = { error: string; notice?: string; done?: boolean };
const emailFrom = (form: FormData) => String(form.get("email") ?? "").trim().toLowerCase();
const validEmail = (email: string) => email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const unavailable = { error: "This service is unavailable. Please try again shortly." };

export async function requestReset(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = emailFrom(form);
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  try {
    const result = await getAuth().requestPasswordReset({ email, redirectTo: `${appOrigin()}/reset-password` });
    if (result.error?.status === 429) return { error: "Too many requests. Wait a minute before trying again." };
    // Keep account existence private, including provider account-not-found errors.
    if (result.error && result.error.status >= 500) return unavailable;
    return { error: "", notice: "If this address has an account, a password reset email will arrive shortly. Check your spam folder too." };
  } catch { return unavailable; }
}

export async function resetPassword(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const token = String(form.get("token") ?? "");
  const newPassword = String(form.get("password") ?? "");
  if (!token || token === "INVALID_TOKEN" || token.length > 4096) return { error: "This reset link is invalid. Request a new link." };
  if (newPassword.length < 8 || newPassword.length > 128) return { error: "Use a password of 8–128 characters." };
  if (newPassword !== form.get("confirmPassword")) return { error: "The passwords do not match." };
  try {
    const { error } = await getAuth().resetPassword({ token, newPassword });
    if (error) return { error: "This reset link is invalid or expired. Request a new link and try again." };
    return { error: "", notice: "Password updated. You can now sign in with your new password.", done: true };
  } catch { return unavailable; }
}

export async function sendVerification(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = emailFrom(form);
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  try {
    const { error } = await getAuth().emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    if (error?.status === 429) return { error: "Too many requests. Wait a minute before trying again." };
    if (error && error.status >= 500) return unavailable;
    return { error: "", notice: "If this address needs verification, check your inbox for a code. Use the most recent code." };
  } catch { return unavailable; }
}

export async function verifyEmail(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = emailFrom(form);
  const otp = String(form.get("otp") ?? "").trim();
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) return { error: "Enter your email address and the six-digit code." };
  try {
    const { error } = await getAuth().emailOtp.verifyEmail({ email, otp });
    if (error) return { error: "The code is invalid or expired. Check your email or request a new code." };
    revalidatePath("/account");
    return { error: "", notice: "Email verified. You can return to your account or sign in.", done: true };
  } catch { return unavailable; }
}
