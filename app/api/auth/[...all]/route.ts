import { eq } from "drizzle-orm";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

export async function POST(request: Request) {
  if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
    const ownerEmail = process.env.MPESA_OWNER_EMAIL?.trim().toLowerCase();
    let body: { email?: unknown } | null = null;

    try {
      body = await request.clone().json();
    } catch {
      return Response.json(
        { message: "Owner account setup is unavailable." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const submittedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!ownerEmail || submittedEmail !== ownerEmail) {
      return Response.json(
        { message: "Owner account setup is unavailable." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [existingOwner] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, ownerEmail))
      .limit(1);

    if (existingOwner) {
      return Response.json(
        { message: "Owner account setup is unavailable." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return handlers.POST(request);
}
