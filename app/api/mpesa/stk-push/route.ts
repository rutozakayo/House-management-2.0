import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mpesaPayments } from "@/lib/db/schema";
import { requireOwner } from "@/lib/mpesa/authorization";
import {
  DarajaError,
  getPublicAppOrigin,
  initiateStkPush,
  isDarajaConfigured,
} from "@/lib/mpesa/daraja";
import {
  resolveIdempotencyAction,
  signCallbackState,
  validateStkPushInput,
} from "@/lib/mpesa/validation.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paymentFields = {
  id: mpesaPayments.id,
  houseId: mpesaPayments.houseId,
  houseLabel: mpesaPayments.houseLabel,
  month: mpesaPayments.month,
  amount: mpesaPayments.amount,
  currency: mpesaPayments.currency,
  status: mpesaPayments.status,
  mpesaReceiptNumber: mpesaPayments.mpesaReceiptNumber,
  resultDescription: mpesaPayments.resultDescription,
  createdAt: mpesaPayments.createdAt,
  completedAt: mpesaPayments.completedAt,
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function publicPayment(payment: Record<string, unknown>) {
  return {
    id: payment.id,
    houseId: payment.houseId,
    houseLabel: payment.houseLabel,
    month: payment.month,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    mpesaReceiptNumber: payment.mpesaReceiptNumber,
    resultDescription: payment.resultDescription,
    createdAt: payment.createdAt,
    completedAt: payment.completedAt,
  };
}

function validationMessage(code: string) {
  switch (code) {
    case "amount":
      return "Enter a positive whole-number amount in KES.";
    case "month":
      return "Choose a valid working month.";
    case "house":
      return "Choose a valid house.";
    case "currency":
      return "Set the app currency to KES before using the Safaricom sandbox.";
    case "phone":
      return "Add a valid Kenyan M-Pesa phone number to this house.";
    default:
      return "Check the payment details and try again.";
  }
}

export async function POST(request: Request) {
  const access = await requireOwner(request);
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Check the payment details and try again." }, 400);
  }

  const validation = validateStkPushInput(body) as {
    ok: boolean;
    code?: string;
    value?: {
      amount: number;
      month: string;
      houseId: string;
      houseLabel: string;
      phoneNumber: string;
      currency: "KES";
    };
  };
  if (!validation.ok || !validation.value) {
    return json(
      { error: validationMessage(validation.code ?? "body") },
      400,
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return json({ error: "Refresh the payment request and try again." }, 400);
  }

  const publicOrigin = getPublicAppOrigin();
  if (!publicOrigin) {
    return json(
      { error: "M-Pesa requires a public HTTPS preview or deployment for callbacks." },
      503,
    );
  }
  if (!isDarajaConfigured()) {
    return json({ error: "M-Pesa sandbox credentials are not configured." }, 503);
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return json({ error: "The owner payment service is not configured." }, 503);
  }

  const input = validation.value;
  const [existing] = await db
    .select({
      id: mpesaPayments.id,
      userId: mpesaPayments.userId,
      idempotencyKey: mpesaPayments.idempotencyKey,
      houseId: mpesaPayments.houseId,
      month: mpesaPayments.month,
      amount: mpesaPayments.amount,
      phoneNumber: mpesaPayments.phoneNumber,
      status: mpesaPayments.status,
      houseLabel: mpesaPayments.houseLabel,
      currency: mpesaPayments.currency,
      mpesaReceiptNumber: mpesaPayments.mpesaReceiptNumber,
      resultDescription: mpesaPayments.resultDescription,
      createdAt: mpesaPayments.createdAt,
      completedAt: mpesaPayments.completedAt,
    })
    .from(mpesaPayments)
    .where(
      and(
        eq(mpesaPayments.userId, access.userId),
        eq(mpesaPayments.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  if (existing) {
    const action = resolveIdempotencyAction(existing, input);
    if (action === "conflict") {
      return json({ error: "That payment request key was already used for different details." }, 409);
    }
    return json({ payment: publicPayment(existing) });
  }

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [activeCount] = await db
    .select({ value: count() })
    .from(mpesaPayments)
    .where(
      and(
        eq(mpesaPayments.userId, access.userId),
        inArray(mpesaPayments.status, ["pending", "needs_review"]),
        gte(mpesaPayments.createdAt, cutoff),
      ),
    );
  if (Number(activeCount?.value ?? 0) >= 3) {
    return json(
      { error: "There are several pending M-Pesa prompts. Check their status before starting another." },
      429,
    );
  }

  const id = randomUUID();
  const callbackState = signCallbackState(id, access.userId, secret);
  const callbackUrl = new URL("/api/mpesa/callback", publicOrigin);
  callbackUrl.searchParams.set("state", callbackState);
  const accountReference = `RENT-${id.replace(/-/g, "").slice(0, 6)}`;

  const [payment] = await db
    .insert(mpesaPayments)
    .values({
      id,
      userId: access.userId,
      idempotencyKey,
      houseId: input.houseId,
      houseLabel: input.houseLabel,
      month: input.month,
      phoneNumber: input.phoneNumber,
      amount: input.amount,
      currency: "KES",
      status: "pending",
    })
    .onConflictDoNothing({
      target: [mpesaPayments.userId, mpesaPayments.idempotencyKey],
    })
    .returning();

  if (!payment) {
    const [racedPayment] = await db
      .select({
        id: mpesaPayments.id,
        userId: mpesaPayments.userId,
        idempotencyKey: mpesaPayments.idempotencyKey,
        houseId: mpesaPayments.houseId,
        month: mpesaPayments.month,
        amount: mpesaPayments.amount,
        phoneNumber: mpesaPayments.phoneNumber,
        status: mpesaPayments.status,
        houseLabel: mpesaPayments.houseLabel,
        currency: mpesaPayments.currency,
        mpesaReceiptNumber: mpesaPayments.mpesaReceiptNumber,
        resultDescription: mpesaPayments.resultDescription,
        createdAt: mpesaPayments.createdAt,
        completedAt: mpesaPayments.completedAt,
      })
      .from(mpesaPayments)
      .where(
        and(
          eq(mpesaPayments.userId, access.userId),
          eq(mpesaPayments.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (!racedPayment) return json({ error: "Payment could not be recorded." }, 500);
    const action = resolveIdempotencyAction(racedPayment, input);
    if (action === "conflict") {
      return json({ error: "That payment request key was already used for different details." }, 409);
    }
    return json({ payment: publicPayment(racedPayment) });
  }

  let result: { merchantRequestId: string; checkoutRequestId: string };
  try {
    result = await initiateStkPush({
      phoneNumber: input.phoneNumber,
      amount: input.amount,
      callbackUrl: callbackUrl.toString(),
      accountReference,
    });
  } catch (error) {
    const outcome = error instanceof DarajaError ? error.outcome : "uncertain";
    const status = outcome === "uncertain" ? "needs_review" : "failed";
    const description = status === "needs_review"
      ? "M-Pesa could not confirm whether the prompt was created. Check your phone before retrying."
      : "M-Pesa could not start the payment prompt.";

    await db
      .update(mpesaPayments)
      .set({ status, resultDescription: description, updatedAt: new Date() })
      .where(
        and(
          eq(mpesaPayments.id, id),
          eq(mpesaPayments.userId, access.userId),
          eq(mpesaPayments.status, "pending"),
        ),
      );

    const [latest] = await db
      .select(paymentFields)
      .from(mpesaPayments)
      .where(and(eq(mpesaPayments.id, id), eq(mpesaPayments.userId, access.userId)))
      .limit(1);

    return json(
      { payment: publicPayment(latest ?? payment), error: description },
      status === "needs_review" ? 202 : 502,
    );
  }

  try {
    await db
      .update(mpesaPayments)
      .set({
        merchantRequestId: result.merchantRequestId,
        checkoutRequestId: result.checkoutRequestId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mpesaPayments.id, id),
          eq(mpesaPayments.userId, access.userId),
          eq(mpesaPayments.status, "pending"),
        ),
      );
  } catch {
    const description = "The prompt may have been sent but could not be saved. Check your phone before retrying.";
    await db
      .update(mpesaPayments)
      .set({ status: "needs_review", resultDescription: description, updatedAt: new Date() })
      .where(
        and(
          eq(mpesaPayments.id, id),
          eq(mpesaPayments.userId, access.userId),
          inArray(mpesaPayments.status, ["pending", "needs_review"]),
        ),
      );
    const [latest] = await db
      .select(paymentFields)
      .from(mpesaPayments)
      .where(and(eq(mpesaPayments.id, id), eq(mpesaPayments.userId, access.userId)))
      .limit(1);
    return json({ payment: publicPayment(latest ?? payment), error: description }, 202);
  }

  const [latest] = await db
    .select(paymentFields)
    .from(mpesaPayments)
    .where(and(eq(mpesaPayments.id, id), eq(mpesaPayments.userId, access.userId)))
    .limit(1);

  return json({ payment: publicPayment(latest ?? payment) });
}
