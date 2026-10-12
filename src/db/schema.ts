import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  boolean,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  authSubject: varchar("auth_subject", { length: 255 }),
  authIssuer: varchar("auth_issuer", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("users_auth_identity_unique").on(table.authIssuer, table.authSubject)]);

export const tradingAccounts = pgTable("trading_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("trading_accounts_one_default_per_user").on(table.userId).where(sql`${table.isDefault} = true`),
]);

export const trades = pgTable("trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  revision: integer("revision").default(0).notNull(),
  submissionKey: uuid("submission_key"),
  submissionHash: varchar("submission_hash", { length: 64 }),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  direction: varchar("direction", { length: 5 }).notNull(),
  setup: varchar("setup", { length: 100 }),
  rationale: varchar("rationale", { length: 2000 }),
  notes: varchar("notes", { length: 2000 }),
  planAdherence: varchar("plan_adherence", { length: 20 }),
  reviewWentWell: varchar("review_went_well", { length: 2000 }),
  reviewImprove: varchar("review_improve", { length: 2000 }),
  reviewedAt: timestamp("reviewed_at"),
  entryPrice: numeric("entry_price", { precision: 14, scale: 6 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 14, scale: 6 }),
  quantity: numeric("quantity", { precision: 14, scale: 6 }).notNull(),
  pnl: numeric("pnl", { precision: 14, scale: 2 }),
  entryTime: timestamp("entry_time").notNull(),
  exitTime: timestamp("exit_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("trades_account_submission_unique").on(table.accountId, table.submissionKey)]);

export const tradeImports = pgTable("trade_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  accountId: uuid("account_id").notNull().references(() => tradingAccounts.id),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  rowCount: integer("row_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("trade_imports_owner_payload_unique").on(table.userId, table.payloadHash)]);

export const tradeImportRows = pgTable("trade_import_rows", {
  tradeId: uuid("trade_id").primaryKey().references(() => trades.id),
  importId: uuid("import_id").notNull().references(() => tradeImports.id),
}, table => [index("trade_import_rows_import_idx").on(table.importId)]);
