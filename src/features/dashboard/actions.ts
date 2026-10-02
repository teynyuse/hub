"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { widgetSchema } from "@/lib/validation";
import type { Widget } from "@/lib/types";
export async function saveLayout(layout: Widget[]) {
  const parsed = widgetSchema.safeParse(layout);
  if (!parsed.success) return { error: "Ongeldige widgetindeling." };
  const { db, user } = await requireUser();
  const { error } = await db
    .from("profiles")
    .update({ dashboard_layout: parsed.data })
    .eq("id", user.id);
  if (error) return { error: "Indeling bewaren lukte niet." };
  revalidatePath("/home");
  return { success: true };
}
