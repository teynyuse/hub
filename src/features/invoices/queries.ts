import "server-only";
import { requireUser } from "@/lib/auth";
import { getRows } from "@/features/data/queries";
import type { Invoice, RecurringCost } from "@/lib/types";
export async function getInvoiceOverview(month: string) {
  const { db } = await requireUser();
  const { error } = await db.rpc("ensure_recurring_invoices", { target_month: month + "-01" });
  if (error) throw new Error("Facturen laden lukte niet. Voer de nieuwe facturenmigratie uit.");
  const [invoices, costs] = await Promise.all([
    getRows<Invoice>("invoices", "billing_month", true),
    getRows<RecurringCost>("recurring_costs", "created_at"),
  ]);
  return { invoices: invoices.filter((invoice) => !invoice.dismissed_at), costs };
}
