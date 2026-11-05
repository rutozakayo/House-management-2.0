import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mpesaPayments } from "@/lib/db/schema";
import { queryStkPush } from "@/lib/mpesa/daraja";
import {
  isCallbackCorrelated,
  isTerminalPaymentStatus,
  normalizeMpesaPhone,
  verifyCallbackState,
} from "@/lib/mpesa/validation.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store, max-age=0" };

function acknowledge() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { headers });
}

function metadataValue(items: unknown, name: string): unknown {
  if (!Array.isArray(items)) return undefined;
  const item = items.find(
    (value) =>
      value &&
      typeof value === "object" &&
      "Name" in value &&
      value.Name === name,
  );
  return item && typeof item === "object" && "Value" in item ? item.Value : undefined;
}

export async function POST(request: Request) {
  const stateToken = new URL(request.url).searchParams.get("state") ?? "";
  const secret = process.env.BETTER_AUTH_SECRET;
  const state = secret ? verifyCallbackState(stateToken, secret) : null;
  if (!state) {
    return Response.json({ ResultCode: 1, ResultDesc: "Invalid callback." }, { status: 400, headers });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ResultCode: 1, ResultDesc: "Invalid callback." }, { status: 400, headers });
  }

  const callback =
    payload &&
    typeof payload === "object" &&
    "Body" in payload &&
    payload.Body &&
    typeof payload.Body === "object" &&
    "stkCallback" in payload.Body
      ? payload.Body.stkCallback
      : null;

  if (!callback || typeof callback !== "object") return acknowledge();

  const checkoutRequestId =
    "CheckoutRequestID" in callback && typeof callback.CheckoutRequestID === "string"
      ? callback.CheckoutRequestID
      : "";
  if (!checkoutRequestId) return acknowledge();

  const [payment] = await db
    .select({
      id: mpesaPayments.id,
      userId: mpesaPayments.userId,
      checkoutRequestId: mpesaPayments.checkoutRequestId,
      houseId: mpesaPayments.houseId,
      month: mpesaPayments.month,
      amount: mpesaPayments.amount,
      phoneNumber: mpesaPayments.phoneNumber,
      status: mpesaPayments.status,
    })
    .from(mpesaPayments)
    .where(
      and(
        eq(mpesaPayments.id, state.paymentId),
        eq(mpesaPayments.userId, state.userId),
      ),
    )
    .limit(1);

  if (!payment || !isCallbackCorrelated(payment, checkoutRequestId)) return acknowledge();
  if (isTerminalPaymentStatus(payment.status)) return acknowledge();

  const resultCodeValue = "ResultCode" in callback ? Number(callback.ResultCode) : Number.NaN;
  const callbackReceivedAt = new Date();
  const updateBase = {
    checkoutRequestId: payment.checkoutRequestId,
    callbackReceivedAt,
    updatedAt: callbackReceivedAt,
  };
  const updateWhere = and(
    eq(mpesaPayments.id, payment.id),
    eq(mpesaPayments.userId, payment.userId),
    inArray(mpesaPayments.status, ["pending", "needs_review"]),
  );

  if (!Number.isSafeInteger(resultCodeValue)) {
    await db
      .update(mpesaPayments)
      .set({
        ...updateBase,
        status: "needs_review",
        resultDescription: "M-Pesa confirmation requires review.",
      })
      .where(updateWhere);
    return acknowledge();
  }

  if (resultCodeValue !== 0) {
    await db
      .update(mpesaPayments)
      .set({
        ...updateBase,
        status: "failed",
        resultCode: resultCodeValue,
        resultDescription: "The M-Pesa payment was not completed.",
      })
      .where(updateWhere);
    return acknowledge();
  }

  const items = "CallbackMetadata" in callback && callback.CallbackMetadata && typeof callback.CallbackMetadata === "object"
    ? "Item" in callback.CallbackMetadata
      ? callback.CallbackMetadata.Item
      : undefined
    : undefined;
  const rawAmount = metadataValue(items, "Amount");
  const rawPhone = metadataValue(items, "PhoneNumber");
  const rawReceipt = metadataValue(items, "MpesaReceiptNumber");
  const callbackAmount = rawAmount === undefined ? Number.NaN : Number(rawAmount);
  const callbackPhone = normalizeMpesaPhone(rawPhone);
  const receipt = typeof rawReceipt === "string" ? rawReceipt.trim() : "";

  if (
    callbackAmount !== payment.amount ||
    callbackPhone !== payment.phoneNumber ||
    !/^[A-Z0-9]{4,32}$/i.test(receipt)
  ) {
    await db
      .update(mpesaPayments)
      .set({
        ...updateBase,
        status: "needs_review",
        resultCode: 0,
        resultDescription: "M-Pesa confirmation details did not match the request.",
      })
      .where(updateWhere);
    return acknowledge();
  }

  let queryResult: { responseCode: string; resultCode: string };
  try {
    queryResult = await queryStkPush(checkoutRequestId);
  } catch {
    await db
      .update(mpesaPayments)
      .set({
        ...updateBase,
        status: "needs_review",
        resultCode: 0,
        resultDescription: "M-Pesa could not be independently confirmed. Check the receipt before retrying.",
      })
      .where(updateWhere);
    return acknowledge();
  }

  if (queryResult.responseCode !== "0" || queryResult.resultCode !== "0") {
    await db
      .update(mpesaPayments)
      .set({
        ...updateBase,
        status: "needs_review",
        resultCode: 0,
        resultDescription: "M-Pesa could not be independently confirmed. Check the receipt before retrying.",
      })
      .where(updateWhere);
    return acknowledge();
  }

  await db
    .update(mpesaPayments)
    .set({
      ...updateBase,
      status: "succeeded",
      resultCode: 0,
      resultDescription: "Payment confirmed by Safaricom.",
      mpesaReceiptNumber: receipt,
      completedAt: callbackReceivedAt,
    })
    .where(updateWhere);

  return acknowledge();
}
