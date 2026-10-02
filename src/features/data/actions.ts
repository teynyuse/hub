"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { title, id, date, parseCents, validationMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
function refresh() {
  revalidatePath("/", "layout");
}
function databaseError() {
  return {
    error: "Bewaren lukte niet. Probeer opnieuw en controleer of de database is ingesteld.",
  };
}
export async function addTransaction(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let data;
  try {
    data = {
      title: title.parse(f.get("title")),
      amount_cents: parseCents(f.get("amount")),
      kind: z.enum(["income", "expense"]).parse(f.get("kind")),
      category: title.parse(f.get("category")),
      date: date.parse(f.get("date")),
    };
  } catch (e) {
    return { error: validationMessage(e) };
  }
  const { error } = await db.from("transactions").insert({ ...data, user_id: user.id });
  if (error) return databaseError();
  refresh();
  return { success: "Transactie toegevoegd." };
}
export async function addPayment(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let data;
  try {
    data = {
      title: title.parse(f.get("title")),
      amount_cents: parseCents(f.get("amount")),
      due_date: date.parse(f.get("due_date")),
    };
  } catch (e) {
    return { error: validationMessage(e) };
  }
  const { error } = await db.from("payments").insert({ ...data, user_id: user.id });
  if (error) return databaseError();
  refresh();
  return { success: "Betaling toegevoegd." };
}
export async function addTask(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let data;
  try {
    data = {
      title: title.parse(f.get("title")),
      due_date: f.get("due_date") ? date.parse(f.get("due_date")) : null,
    };
  } catch (e) {
    return { error: validationMessage(e) };
  }
  const { error } = await db.from("tasks").insert({ ...data, user_id: user.id });
  if (error) return databaseError();
  refresh();
  return { success: "Taak toegevoegd." };
}
export async function addEvent(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let data;
  try {
    const start = z.iso.datetime().parse(f.get("starts_at"));
    const end = f.get("ends_at") ? z.iso.datetime().parse(f.get("ends_at")) : null;
    if (end && end <= start) throw new Error("Het einde moet na de start liggen.");
    data = { title: title.parse(f.get("title")), starts_at: start, ends_at: end };
  } catch (e) {
    return { error: validationMessage(e) };
  }
  const { error } = await db.from("calendar_events").insert({ ...data, user_id: user.id });
  if (error) return databaseError();
  refresh();
  return { success: "Afspraak toegevoegd." };
}
export async function updateRecord(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let recordId, table, operation;
  try {
    recordId = id.parse(f.get("id"));
    table = z
      .enum(["tasks", "payments", "transactions", "calendar_events", "pages"])
      .parse(f.get("table"));
    operation = z.enum(["delete", "toggle"]).parse(f.get("operation"));
  } catch (e) {
    return { error: validationMessage(e) };
  }
  if (operation === "toggle") {
    if (table !== "tasks" && table !== "payments") return { error: "Ongeldige actie." };
    const field = table === "tasks" ? "done" : "status";
    const { data: row, error } = await db
      .from(table)
      .select(field)
      .eq("id", recordId)
      .eq("user_id", user.id)
      .single();
    if (error || !row) return { error: "Dit item bestaat niet meer." };
    // Read current value on the server; never trust a client-supplied previous status.
    const current = (row as unknown as Record<string, unknown>)[field];
    const result = await db
      .from(table)
      .update({ [field]: table === "tasks" ? !current : current === "paid" ? "pending" : "paid" })
      .eq("id", recordId)
      .eq("user_id", user.id);
    if (result.error) return databaseError();
  } else {
    const { error } = await db.from(table).delete().eq("id", recordId).eq("user_id", user.id);
    if (error) return databaseError();
  }
  refresh();
  return {};
}
export async function updateProfile(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let data;
  try {
    const tz = String(f.get("timezone"));
    new Intl.DateTimeFormat("nl-BE", { timeZone: tz });
    data = {
      display_name: z.string().trim().min(1).max(80).parse(f.get("display_name")),
      timezone: tz,
      currency: z.enum(["EUR", "USD", "GBP", "BGN"]).parse(f.get("currency")),
    };
  } catch {
    return { error: "Controleer je naam, munt en tijdzone." };
  }
  const { error } = await db.from("profiles").update(data).eq("id", user.id);
  if (error) return databaseError();
  refresh();
  return { success: "Instellingen opgeslagen." };
}
