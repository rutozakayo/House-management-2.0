import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mpesaPayments } from "@/lib/db/schema";
import { requireOwner } from "@/lib/mpesa/authorization";

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

export async function GET(request: Request) {
  const access = await requireOwner(request);
  if ("response" in access) return access.response;

  const month = new URL(request.url).searchParams.get("month");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return json({ error: "Choose a valid working month." }, 400);
  }

  const where = month
    ? and(
        eq(mpesaPayments.userId, access.userId),
        eq(mpesaPayments.month, month),
      )
    : eq(mpesaPayments.userId, access.userId);

  const payments = await db
    .select(paymentFields)
    .from(mpesaPayments)
    .where(where)
    .orderBy(desc(mpesaPayments.createdAt))
    .limit(50);

  return json({ payments });
}
