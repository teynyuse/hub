import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/features/auth/auth-form";
export default async function Login() {
  if (!isConfigured()) redirect("/setup");
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (data.user) redirect("/home");
  return (
    <main className="auth-container">
      <h1>Hub</h1>
      <p className="muted">Log in op je eigen ruimte.</p>
      <AuthForm />
    </main>
  );
}
