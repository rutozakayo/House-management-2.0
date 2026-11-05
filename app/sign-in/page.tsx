import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { auth } from "@/lib/auth";

export const metadata = { title: "Owner sign in" };

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/index.html");

  return <AuthForm mode="sign-in" />;
}
