"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { trades, tradingAccounts, users } from "@/db/schema";

const DEVELOPMENT_EMAIL = "dev@rationale-ai.local";
const DEVELOPMENT_ACCOUNT = "Development Account";

function getRequiredString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function getRequiredNumber(formData: FormData, name: string) {
  const value = getRequiredString(formData, name);
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a valid number`);
  }

  return number;
}

function getOptionalNumber(formData: FormData, name: string) {
  const value = getOptionalString(formData, name);

  if (value === null) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a valid number`);
  }

  return number;
}

function parseLocalDateTime(value: string, name: string) {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.exec(value.trim());

  if (!match) {
    throw new Error(`${name} must be a valid date and time`);
  }

  const [datePart, timePart] = value.trim().split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid date and time`);
  }

  return date;
}

function getRequiredDate(formData: FormData, name: string) {
  const value = getRequiredString(formData, name);
  return parseLocalDateTime(value, name);
}

function getOptionalDate(formData: FormData, name: string) {
  const value = getOptionalString(formData, name);

  if (value === null) {
    return null;
  }

  return parseLocalDateTime(value, name);
}

export async function createTrade(formData: FormData) {
  const symbol = getRequiredString(formData, "symbol").toUpperCase();
  const direction = getRequiredString(formData, "direction");
  const entryPrice = getRequiredNumber(formData, "entryPrice");
  const exitPrice = getOptionalNumber(formData, "exitPrice");
  const quantity = getRequiredNumber(formData, "quantity");
  const pnl = getOptionalNumber(formData, "pnl");
  const entryTime = getRequiredDate(formData, "entryTime");
  const exitTime = getOptionalDate(formData, "exitTime");
  const setup = getOptionalString(formData, "setup");
  const rationale = getOptionalString(formData, "rationale");
  const notes = getOptionalString(formData, "notes");

  if (!["LONG", "SHORT"].includes(direction)) {
    throw new Error("direction must be LONG or SHORT");
  }

  if (symbol.length > 20) {
    throw new Error("symbol must be 20 characters or fewer");
  }

  if (entryPrice <= 0) {
    throw new Error("entryPrice must be greater than zero");
  }

  if (exitPrice !== null && exitPrice <= 0) {
    throw new Error("exitPrice must be greater than zero");
  }

  if (quantity <= 0) {
    throw new Error("quantity must be greater than zero");
  }

  if (setup !== null && setup.length > 100) {
    throw new Error("setup must be 100 characters or fewer");
  }

  if (rationale !== null && rationale.length > 2000) {
    throw new Error("rationale must be 2000 characters or fewer");
  }

  if (notes !== null && notes.length > 2000) {
    throw new Error("notes must be 2000 characters or fewer");
  }

  if (exitTime !== null && exitTime < entryTime) {
    throw new Error("exitTime cannot be before entryTime");
  }

  await db
    .insert(users)
    .values({
      email: DEVELOPMENT_EMAIL,
    })
    .onConflictDoNothing({ target: users.email });

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEVELOPMENT_EMAIL))
    .limit(1);

  if (!user) {
    throw new Error("Unable to resolve development user");
  }

  await db
    .insert(tradingAccounts)
    .values({
      userId: user.id,
      name: DEVELOPMENT_ACCOUNT,
      balance: "0",
    })
    .onConflictDoNothing();

  const [account] = await db
    .select({ id: tradingAccounts.id })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, user.id))
    .limit(1);

  if (!account) {
    throw new Error("Unable to resolve development trading account");
  }

  await db.insert(trades).values({
    accountId: account.id,
    symbol,
    direction,
    setup,
    rationale,
    notes,
    entryPrice: entryPrice.toString(),
    exitPrice: exitPrice?.toString() ?? null,
    quantity: quantity.toString(),
    pnl: pnl?.toString() ?? null,
    entryTime,
    exitTime,
  });

  redirect("/");
}
