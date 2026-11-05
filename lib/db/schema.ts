import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const mpesaPayments = pgTable(
  "mpesa_payments",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    houseId: text("houseId").notNull(),
    houseLabel: text("houseLabel").notNull(),
    month: text("month").notNull(),
    phoneNumber: text("phoneNumber").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("KES"),
    status: text("status", {
      enum: ["pending", "succeeded", "failed", "needs_review"],
    })
      .notNull()
      .default("pending"),
    merchantRequestId: text("merchantRequestId"),
    checkoutRequestId: text("checkoutRequestId"),
    mpesaReceiptNumber: text("mpesaReceiptNumber"),
    resultCode: integer("resultCode"),
    resultDescription: text("resultDescription"),
    callbackReceivedAt: timestamp("callbackReceivedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    uniqueIndex("mpesa_payments_user_idempotency_idx").on(
      table.userId,
      table.idempotencyKey,
    ),
    uniqueIndex("mpesa_payments_checkout_request_idx").on(table.checkoutRequestId),
    uniqueIndex("mpesa_payments_receipt_idx").on(table.mpesaReceiptNumber),
    check(
      "mpesa_payments_month_format_check",
      sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check("mpesa_payments_amount_positive_check", sql`${table.amount} > 0`),
    check("mpesa_payments_currency_check", sql`${table.currency} = 'KES'`),
    check(
      "mpesa_payments_status_check",
      sql`${table.status} in ('pending', 'succeeded', 'failed', 'needs_review')`,
    ),
  ],
);
