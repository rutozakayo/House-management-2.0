import "server-only";
import { betterAuth } from "better-auth";
import { pool } from "@/lib/db";

function exactOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const origin = new URL(candidate).origin;
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

const previewOrigins = [
  process.env.V0_RUNTIME_URL,
  process.env.V0_DEV_APP_URL,
  process.env.V0_BUILD_URL,
  process.env.V0_SANDBOX_URL,
]
  .map(exactOrigin)
  .filter((origin): origin is string => Boolean(origin));

const productionOrigins = [
  exactOrigin(process.env.VERCEL_URL),
  exactOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  database: pool,
  baseURL:
    exactOrigin(process.env.BETTER_AUTH_URL) ??
    exactOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    exactOrigin(process.env.VERCEL_URL) ??
    exactOrigin(process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://localhost:8080", ...previewOrigins]
      : []),
    ...(process.env.NODE_ENV === "production" ? productionOrigins : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // Required by the cross-site v0 preview iframe.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
});
