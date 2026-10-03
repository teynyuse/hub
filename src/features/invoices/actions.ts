"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/features/data/queries";
import { localDate } from "@/lib/format";
import { title, id, date, parseCents, validationMessage } from "@/lib/validation";
import { costCategories, providerKey } from "./extract";
import type { ActionState } from "@/lib/types";
function refresh() {
  revalidatePath("/", "layout");
}
function fields(f: FormData) {
  const supplier = z
    .string()
    .trim()
    .max(100)
    .parse(f.get("supplier") ?? "");
  return {
    title: title.parse(f.get("title")),
    supplier,
    provider_key: providerKey(supplier),
    cost_category: z.enum(costCategories).parse(f.get("cost_category")),
  };
}
export async function addInvoice(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    const due = date.parse(f.get("due_date"));
    const { error } = await db
      .from("invoices")
      .insert({
        ...fields(f),
        user_id: user.id,
        amount_cents: parseCents(f.get("amount")),
        due_date: due,
        billing_month: due.slice(0, 7) + "-01",
        source: "manual",
        source_key: crypto.randomUUID(),
        reviewed_at: new Date().toISOString(),
      });
    if (error) throw new Error("Factuur opslaan lukte niet. Controleer de facturenmigratie.");
    refresh();
    return { success: "Factuur toegevoegd." };
  } catch (e) {
    return { error: validationMessage(e) };
  }
}
export async function editInvoice(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    const due = f.get("due_date") ? date.parse(f.get("due_date")) : null;
    const amount = f.get("amount") ? parseCents(f.get("amount")) : null;
    const { error } = await db
      .from("invoices")
      .update({
        ...fields(f),
        amount_cents: amount,
        due_date: due,
        needs_review: amount === null || due === null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id.parse(f.get("id")))
      .eq("user_id", user.id);
    if (error) throw new Error("Factuur aanpassen lukte niet.");
    refresh();
    return { success: "Factuur bijgewerkt." };
  } catch (e) {
    return { error: validationMessage(e) };
  }
}
export async function setInvoicePaid(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    const paid = z.enum(["true", "false"]).parse(f.get("paid")) === "true";
    const { error } = await db
      .from("invoices")
      .update({
        status: paid ? "paid" : "pending",
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq("id", id.parse(f.get("id")))
      .eq("user_id", user.id);
    if (error) throw new Error("Betaalstatus opslaan lukte niet.");
    refresh();
    return {};
  } catch (e) {
    return { error: validationMessage(e) };
  }
}
export async function saveRecurringCost(_: ActionState, f: FormData): Promise<ActionState> {
  const { db } = await requireUser();
  try {
    const profile = await getProfile();
    const month = localDate(profile.timezone).slice(0, 7) + "-01";
    const start =
      z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .parse(f.get("start_month")) + "-01";
    const { error } = await db.rpc("save_recurring_cost", {
      cost_id: f.get("id") ? id.parse(f.get("id")) : null,
      target_month: month,
      details: {
        ...fields(f),
        amount_cents: parseCents(f.get("amount")),
        day_of_month: z.coerce.number().int().min(1).max(31).parse(f.get("day_of_month")),
        start_month: start,
      },
    });
    if (error)
      throw new Error("Maandelijkse kost opslaan lukte niet. Controleer de facturenmigratie.");
    refresh();
    return { success: "Maandelijkse kost opgeslagen." };
  } catch (e) {
    return { error: validationMessage(e) };
  }
}
export async function setRecurringActive(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    const active = z.enum(["true", "false"]).parse(f.get("active")) === "true";
    const { error } = await db
      .from("recurring_costs")
      .update({ active })
      .eq("id", id.parse(f.get("id")))
      .eq("user_id", user.id);
    if (error) throw new Error("Maandelijkse kost aanpassen lukte niet.");
    refresh();
    return {};
  } catch (e) {
    return { error: validationMessage(e) };
  }
}
