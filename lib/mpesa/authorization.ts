import "server-only";
import { auth } from "@/lib/auth";
import { isAllowedRequestOrigin } from "@/lib/mpesa/validation.mjs";

function allowedRequestOrigins(): string[] {
  const origins = [process.env.BETTER_AUTH_URL];
  if (process.env.NODE_ENV === "development") {
    origins.push(
      process.env.V0_RUNTIME_URL,
      process.env.V0_DEV_APP_URL,
      process.env.V0_BUILD_URL,
      process.env.V0_SANDBOX_URL,
      "http://localhost:3000",
      "http://localhost:8080",
    );
  } else {
    origins.push(
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
    );
  }
  return origins.filter((origin): origin is string => Boolean(origin));
}

export async function requireOwner(request: Request): Promise<
  | { userId: string }
  | { response: Response }
> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (!isAllowedRequestOrigin(origin, allowedRequestOrigins())) {
      return {
        response: Response.json(
          { error: "Invalid request origin." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        ),
      };
    }
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return {
      response: Response.json(
        { error: "Sign in to manage M-Pesa payments." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  const ownerEmail = process.env.MPESA_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || session.user.email.trim().toLowerCase() !== ownerEmail) {
    return {
      response: Response.json(
        { error: "This account is not authorized for M-Pesa payments." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  return { userId: session.user.id };
}
