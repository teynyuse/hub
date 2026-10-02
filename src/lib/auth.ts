import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
export async function requireUser() {
  if (!isConfigured()) redirect("/setup");
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { db, user: data.user };
}
