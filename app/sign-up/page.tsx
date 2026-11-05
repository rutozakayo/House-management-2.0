import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export const metadata = { title: "Set up the owner account" };

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/index.html");

  const ownerEmail = process.env.MPESA_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="setup-title">
          <div className="auth-brand">
            <img src="/icons/favicon.svg" width="38" height="38" alt="" aria-hidden="true" />
            <span>Rental House Manager</span>
          </div>
          <h1 id="setup-title">Owner setup is unavailable</h1>
          <p className="auth-copy">The owner account has not been configured for this deployment.</p>
          <Link className="auth-link" href="/index.html">Return to the dashboard</Link>
        </section>
      </main>
    );
  }

  const [existingOwner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ownerEmail))
    .limit(1);

  if (existingOwner) redirect("/sign-in");

  return <AuthForm mode="sign-up" />;
}
