import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mpesaPayments } from "@/lib/db/schema";
import { requireOwner } from "@/lib/mpesa/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const access = await requireOwner(request);
  if ("response" in access) return access.response;

  const { id } = await context.params;
  const [payment] = await db
    .select({
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
    })
    .from(mpesaPayments)
    .where(and(eq(mpesaPayments.id, id), eq(mpesaPayments.userId, access.userId)))
    .limit(1);

  if (!payment) {
    return Response.json(
      { error: "Payment not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { payment },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
