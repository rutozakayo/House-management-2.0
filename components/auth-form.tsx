"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
          })
        : await authClient.signIn.email({
            email: email.trim().toLowerCase(),
            password,
          });

      if (result.error) {
        setError(
          isSignUp
            ? "Owner account setup could not be completed. If it is already set up, sign in instead."
            : "Sign-in failed. Check your details and try again.",
        );
        return;
      }

      router.replace("/index.html");
      router.refresh();
    } catch {
      setError(
        isSignUp
          ? "Owner account setup could not be completed. If it is already set up, sign in instead."
          : "Sign-in failed. Check your details and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <img src="/icons/favicon.svg" width="38" height="38" alt="" aria-hidden="true" />
          <span>Rental House Manager</span>
        </div>

        <h1 id="auth-title">{isSignUp ? "Set up the owner account" : "Welcome back"}</h1>
        <p className="auth-copy">
          {isSignUp
            ? "Create the single owner account used to protect M-Pesa payments."
            : "Sign in to request and review M-Pesa rent payments."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
          {isSignUp && (
            <label className="auth-field" htmlFor="auth-name">
              Name
              <input
                className="auth-input"
                id="auth-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
          )}

          <label className="auth-field" htmlFor="auth-email">
            Email
            <input
              className="auth-input"
              id="auth-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>

          <label className="auth-field" htmlFor="auth-password">
            Password
            <input
              className="auth-input"
              id="auth-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
            />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? "Please wait…" : isSignUp ? "Create owner account" : "Sign in"}
          </button>
        </form>

        <p className="auth-note">
          {isSignUp
            ? "Only the configured owner email can create this account."
            : "Your password is handled by Better Auth and is never stored in the browser ledger."}
        </p>

        <div className="auth-footer">
          <Link className="auth-link" href="/index.html">Back to dashboard</Link>
          <Link className="auth-link" href={isSignUp ? "/sign-in" : "/sign-up"}>
            {isSignUp ? "Already set up? Sign in" : "First-time owner setup"}
          </Link>
        </div>
      </section>
    </main>
  );
}
