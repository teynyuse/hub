import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { runInvoiceSync } from "@/features/invoices/sync";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("gmail_connections")
    .select("user_id")
    .lte("next_sync_at", now)
    .or(`sync_lock_until.is.null,sync_lock_until.lt.${now}`)
    .order("next_sync_at")
    .limit(20);
  if (error) return Response.json({ error: "Sync unavailable" }, { status: 503 });
  let succeeded = 0;
  let failed = 0;
  for (const connection of data ?? []) {
    if (Date.now() - started > 250_000) break;
    const result = await runInvoiceSync(connection.user_id);
    if (result.error) failed++;
    else succeeded++;
  }
  return Response.json(
    { checked: succeeded + failed, succeeded, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
