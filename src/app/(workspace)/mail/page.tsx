import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/features/data/queries";
import { getInvoiceOverview } from "@/features/invoices/queries";
import { gmailConfigured, canReadMail } from "@/features/mail/google";
import { connectGmail, disconnectGmail, rescanInvoices, syncGmail } from "@/features/mail/actions";
import {
  addInvoice,
  editInvoice,
  saveRecurringCost,
  setRecurringActive,
} from "@/features/invoices/actions";
import { PaidCheckbox } from "@/features/invoices/paid-checkbox";
import { DismissInvoiceButton } from "@/features/invoices/dismiss-button";
import { InvoiceFields } from "@/features/invoices/fields";
import { InvoiceAutoSync } from "@/features/invoices/auto-sync";
import { ActionForm } from "@/components/action-form";
import { localDate, money, dateLabel } from "@/lib/format";
import type { Invoice } from "@/lib/types";
export const maxDuration = 300;
export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string }>;
}) {
  const { user } = await requireUser();
  const profile = await getProfile();
  const today = localDate(profile.timezone);
  const params = await searchParams;
  const requested =
    params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));
  const month =
    Number(requested.slice(0, 4)) >= currentYear - 4 &&
    Number(requested.slice(0, 4)) <= currentYear + 1
      ? requested
      : today.slice(0, 7);
  const { invoices, costs } = await getInvoiceOverview(month);
  const paymentOrder = (a: Invoice, b: Invoice) => {
    if (!a.due_date) return b.due_date ? 1 : 0;
    if (!b.due_date) return -1;
    const aFuture = a.due_date >= today;
    const bFuture = b.due_date >= today;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date);
  };
  const open = invoices
    .filter((i) => i.status === "pending" && i.billing_month <= month + "-01")
    .sort(paymentOrder);
  const paid = invoices.filter((i) => i.status === "paid" && i.billing_month === month + "-01");
  const total = (rows: Invoice[]) => rows.reduce((sum, i) => sum + (i.amount_cents ?? 0), 0);
  let connection: {
    email_address: string;
    granted_scope: string;
    last_synced_at: string | null;
    next_sync_at: string;
    last_sync_error: string | null;
    sync_queue: string[];
  } | null = null;
  if (gmailConfigured()) {
    const { data, error } = await adminClient()
      .from("gmail_connections")
      .select("email_address,granted_scope,last_synced_at,next_sync_at,last_sync_error,sync_queue")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error("Gmail-status laden lukte niet. Controleer de facturenmigratie.");
    connection = data;
  }
  const readable = Boolean(connection && canReadMail(connection.granted_scope));
  const list = (rows: Invoice[]) =>
    rows.length ? (
      <div className="invoice-list">
        {rows.map((i) => (
          <article className="invoice-row" key={i.id}>
            <div className="invoice-main">
              <strong>{i.title}</strong>
              <span className="muted">
                {i.source === "recurring" && !i.gmail_id ? "Maandelijkse kost" : i.supplier}
                {i.invoice_number && ` · ${i.invoice_number}`}
              </span>
            </div>
            <div className="invoice-value">
              <span className="invoice-label">Bedrag</span>
              <strong>{i.amount_cents === null ? "Nakijken" : money(i.amount_cents, "EUR")}</strong>
            </div>
            <div className="invoice-value">
              <span className="invoice-label">Betaaldatum</span>
              <strong>{i.due_date ? dateLabel(i.due_date, profile.timezone) : "Nakijken"}</strong>
            </div>
            <div className="invoice-state">
              <PaidCheckbox id={i.id} paid={i.status === "paid"} title={i.title} />
              <div className="invoice-badges">
                {i.status === "pending" && i.due_date && i.due_date < today && (
                  <span className="badge">Te laat</span>
                )}
                {i.needs_review && <span className="badge">Controleren</span>}
              </div>
            </div>
            <div className="invoice-actions">
              <details className="invoice-edit">
                <summary>Wijzig</summary>
                <div className="invoice-edit-form">
                  <ActionForm action={editInvoice} submit="Opslaan">
                    <InvoiceFields value={i} month={month} />
                  </ActionForm>
                </div>
              </details>
              {i.gmail_id && connection && (
                <a
                  className="text-link"
                  href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(connection.email_address)}#all/${encodeURIComponent(i.gmail_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open mail
                </a>
              )}
              {i.gmail_id && <DismissInvoiceButton id={i.id} title={i.title} />}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <p className="muted">Geen facturen.</p>
    );
  return (
    <>
      <div className="page-heading">
        <h1>Facturen</h1>
        <form className="filter-form">
          <label>
            Maand
            <input type="month" name="month" defaultValue={month} />
          </label>
          <button>Tonen</button>
        </form>
      </div>
      <section className="panel invoice-summary">
        <dl className="totals">
          <div>
            <dt>Nog te betalen</dt>
            <dd>{money(total(open), "EUR")}</dd>
          </div>
          <div>
            <dt>Betaald deze maand</dt>
            <dd>{money(total(paid), "EUR")}</dd>
          </div>
          <div>
            <dt>Open betalingen</dt>
            <dd>{open.length}</dd>
          </div>
        </dl>
        <p className="muted">
          Open facturen tot en met deze maand. Afvinken registreert je betaling; Hub voert geen
          betaling uit.
        </p>
        {open.some((i) => i.amount_cents === null) && (
          <p>Er zijn facturen zonder bekend bedrag. Die zijn nog niet in het totaal opgenomen.</p>
        )}
      </section>
      <div className="columns section-space">
        <div className="stack">
          <section className="panel">
            <h2>Te betalen</h2>
            {list(open)}
          </section>
          <section className="panel">
            <h2>Betaald</h2>
            {list(paid)}
          </section>
          <section className="panel">
            <h2>Maandelijkse kosten</h2>
            <p className="muted">
              Elke maand een eigen betaalvakje. Een betaalde maand blijft betaald.
            </p>
            {costs.length ? (
              <ul className="item-list">
                {costs.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.title}</strong>
                      <p>
                        {money(c.amount_cents, "EUR")} · dag {c.day_of_month}
                        {!c.active && " · Gepauzeerd"}
                      </p>
                      <details>
                        <summary>Aanpassen</summary>
                        <ActionForm action={saveRecurringCost} submit="Opslaan">
                          <InvoiceFields value={c} recurring month={month} />
                        </ActionForm>
                      </details>
                    </div>
                    <ActionForm
                      action={setRecurringActive}
                      submit={c.active ? "Pauzeren" : "Hervatten"}
                      className="inline-form"
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={String(!c.active)} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nog geen maandelijkse kosten.</p>
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="panel invoice-tools">
            <h2>Zelf toevoegen</h2>
            <details open>
              <summary>Maandelijkse kost</summary>
              <div className="tool-form">
                <ActionForm action={saveRecurringCost} submit="Toevoegen">
                  <InvoiceFields recurring month={today.slice(0, 7)} />
                </ActionForm>
              </div>
            </details>
            <details>
              <summary>Eenmalige factuur</summary>
              <div className="tool-form">
                <ActionForm action={addInvoice} submit="Toevoegen">
                  <InvoiceFields month={month} />
                </ActionForm>
              </div>
            </details>
          </section>
          <section className="panel">
            <h2>Facturen uit Gmail</h2>
            <p className="muted">
              Elke 30 minuten gecontroleerd. Bij de eerste import maximaal 100 recente inboxmails;
              daarna alleen nieuwe mails. Geen mailboxweergave.
            </p>
            {params.error && (
              <p className="error">Gmail koppelen lukte niet. Controleer je toestemming.</p>
            )}
            {connection ? (
              <>
                <p>{connection.email_address}</p>
                <p className="muted">
                  {connection.last_synced_at
                    ? `Laatst gecontroleerd: ${dateLabel(connection.last_synced_at, profile.timezone)} ${new Date(connection.last_synced_at).toLocaleTimeString("nl-BE", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit" })}`
                    : "Eerste controle nog niet afgerond."}
                </p>
                {connection.sync_queue.length > 0 && (
                  <p className="muted">
                    Nog {connection.sync_queue.length} mails te controleren. De voortgang is
                    bewaard.
                  </p>
                )}
                {connection.last_sync_error && (
                  <p className="error" role="alert">
                    {connection.last_sync_error}
                  </p>
                )}
                <InvoiceAutoSync enabled={readable} nextSyncAt={connection.next_sync_at} />
                {readable ? (
                  <>
                    <ActionForm action={syncGmail} submit="Controleer indien nodig" />
                    <ActionForm action={rescanInvoices} submit="Facturen opnieuw zoeken" />
                  </>
                ) : (
                  <form action={connectGmail}>
                    <button>Gmail opnieuw koppelen</button>
                  </form>
                )}
                <ActionForm action={disconnectGmail} submit="Ontkoppelen" />
              </>
            ) : gmailConfigured() ? (
              <form action={connectGmail}>
                <button>Gmail koppelen</button>
              </form>
            ) : (
              <p className="muted">Gmail is nog niet ingesteld.</p>
            )}
            <p className="muted">
              Onzekere bedragen of datums staan op Controleren. Klik op Aanpassen om ze in te
              vullen.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
