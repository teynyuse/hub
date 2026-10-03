import "server-only";
import { requireUser } from "@/lib/auth";
import type {
  Profile,
  Transaction,
  Payment,
  Invoice,
  Task,
  Page,
  FileRecord,
  Email,
  CalendarEvent,
} from "@/lib/types";
import { localDate, monthBounds } from "@/lib/format";
export async function getProfile() {
  const { db, user } = await requireUser();
  const { data, error } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw new Error("Profiel laden lukte niet. Voer eerst de database-migratie uit.");
  return data as Profile;
}
export async function getRows<T>(table: string, order: string, ascending = false) {
  const { db, user } = await requireUser();
  const rows: T[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("user_id", user.id)
      .order(order, { ascending })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Gegevens laden lukte niet. Controleer je verbinding en database.");
    rows.push(...(data as T[]));
    if (data.length < 500) return rows;
  }
  throw new Error("Deze module bevat te veel items. Voeg paginering in de interface toe.");
}
export async function getTransactions(month: string) {
  const { db, user } = await requireUser();
  const { start, end } = monthBounds(month);
  const rows: Transaction[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await db
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Transacties laden lukte niet.");
    rows.push(...(data as Transaction[]));
    if (data.length < 500) return rows;
  }
  throw new Error("Te veel transacties deze maand. Voeg paginering toe voor dit volume.");
}
export async function dashboardData() {
  const profile = await getProfile();
  const today = localDate(profile.timezone);
  const month = today.slice(0, 7);
  const { db } = await requireUser();
  const generated = await db.rpc("ensure_recurring_invoices", { target_month: month + "-01" });
  if (generated.error) throw new Error("Voer de facturenmigratie uit.");
  const [transactions, invoices, tasks, pages, emails, events] = await Promise.all([
    getTransactions(month),
    getRows<Invoice>("invoices", "billing_month", true),
    getRows<Task>("tasks", "created_at"),
    getRows<Page>("pages", "updated_at"),
    getRows<Email>("emails", "received_at"),
    getRows<CalendarEvent>("calendar_events", "starts_at", true),
  ]);
  const payments: Payment[] = invoices
    .filter((i) => i.amount_cents !== null && i.due_date !== null)
    .map((i) => ({
      id: i.id,
      title: i.title,
      amount_cents: i.amount_cents!,
      due_date: i.due_date!,
      status: i.status,
    }));
  return { profile, today, transactions, payments, invoices, tasks, pages, emails, events };
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
export type { FileRecord };
