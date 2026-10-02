"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/types";
const credentials = z.object({
  email: z.email(),
  password: z.string().min(8, "Gebruik minstens 8 tekens.").max(128),
});
export async function authenticate(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await createClient();
  if (form.get("mode") === "register") {
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 1 || name.length > 80)
      return { error: "Vul je naam in (maximaal 80 tekens)." };
    const { data, error } = await db.auth.signUp({
      ...parsed.data,
      options: { data: { display_name: name } },
    });
    if (error)
      return { error: "Registreren lukte niet. Controleer je gegevens of probeer later opnieuw." };
    if (!data.session)
      return {
        success: "Controleer je mailbox en bevestig je e-mailadres. Daarna kun je inloggen.",
      };
  } else {
    const { error } = await db.auth.signInWithPassword(parsed.data);
    if (error)
      return {
        error: "Inloggen lukte niet. Controleer je e-mail, wachtwoord en e-mailbevestiging.",
      };
  }
  redirect("/home");
}
export async function signOut() {
  const { db } = await requireUser();
  await db.auth.signOut();
  redirect("/login");
}
