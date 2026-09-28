import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  symbol: varchar("symbol", { length: 20 }).notNull(),
  direction: varchar("direction", { length: 5 }).notNull(),
  setup: varchar("setup", { length: 100 }),
  rationale: varchar("rationale", { length: 2000 }),
  notes: varchar("notes", { length: 2000 }),
  entryPrice: numeric("entry_price", { precision: 14, scale: 6 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 14, scale: 6 }),
  quantity: numeric("quantity", { precision: 14, scale: 6 }).notNull(),
  pnl: numeric("pnl", { precision: 14, scale: 2 }),
  entryTime: timestamp("entry_time").notNull(),
  exitTime: timestamp("exit_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
