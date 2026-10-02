import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { getRows, getProfile } from "@/features/data/queries";
import { gmailConfigured } from "@/features/mail/google";
import { connectGmail, syncGmail, disconnectGmail } from "@/features/mail/actions";
import { updateEmail } from "@/features/data/actions";
import { ActionForm } from "@/components/action-form";
import { categories } from "@/lib/validation";
import type { Email } from "@/lib/types";
import { dateLabel } from "@/lib/format";
export const maxDuration = 120;
export default async function Mail({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    important?: string;
    error?: string;
    connected?: string;
  }>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;
  const [emails, profile] = await Promise.all([
    getRows<Email>("emails", "received_at"),
    getProfile(),
  ]);
  const configured = gmailConfigured();
  let connection: { email_address: string; last_synced_at: string | null } | null = null;
  if (configured) {
    const { data } = await adminClient()
      .from("gmail_connections")
      .select("email_address,last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    connection = data;
  }
  const visible = emails.filter(
    (e) =>
      (!params.category || e.category === params.category) &&
      (params.important !== "1" || e.important),
  );
  return (
    <>
      <div className="page-heading">
        <h1>Mail</h1>
        {connection && (
          <ActionForm action={syncGmail} submit="Synchroniseren" className="inline-form" />
        )}
      </div>
      {params.error && (
        <p className="error" role="alert">
          Gmail koppelen lukte niet. Controleer je Google-instellingen en probeer opnieuw.
        </p>
      )}
      {params.connected && (
        <p role="status">Gmail is gekoppeld. Klik op Synchroniseren om mails op te halen.</p>
      )}
      <div className="panel section-space">
        <div className="row">
          {connection ? (
            <>
              <span>{connection.email_address}</span>
              <ActionForm action={disconnectGmail} submit="Ontkoppelen" className="inline-form" />
            </>
          ) : configured ? (
            <form action={connectGmail}>
              <button className="primary">Gmail koppelen</button>
            </form>
          ) : (
            <p className="muted">
              Gmail is nog niet ingesteld. Volg de Gmail-stappen in README.md.
            </p>
          )}
        </div>
        {connection && (
          <p className="muted section-space">
            {connection.last_synced_at
              ? `Laatst bijgewerkt: ${dateLabel(connection.last_synced_at, profile.timezone)}.`
              : "Nog niet gesynchroniseerd."}{" "}
            Per synchronisatie worden de laatste 50 inboxmails gecontroleerd. Eerder opgeslagen
            mails blijven zichtbaar.
          </p>
        )}
      </div>
      <form className="filter-form section-space">
        <label>
          Categorie
          <select name="category" defaultValue={params.category ?? ""}>
            <option value="">Alle categorieën</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            name="important"
            type="checkbox"
            value="1"
            defaultChecked={params.important === "1"}
          />
          Alleen belangrijk
        </label>
        <button>Filteren</button>
      </form>
      <section className="panel section-space">
        {visible.length ? (
          visible.map((e) => (
            <article key={e.id} className="mail-item">
              <h2>
                {e.subject} {e.unread && <span className="badge">Ongelezen</span>}
              </h2>
              <p className="muted">
                {e.sender} · {dateLabel(e.received_at, profile.timezone)}
              </p>
              <ActionForm action={updateEmail} submit="Bewaren" className="mail-controls">
                <input type="hidden" name="id" value={e.id} />
                <label>
                  Categorie
                  <select name="category" defaultValue={e.category}>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" name="important" defaultChecked={e.important} />
                  Belangrijk
                </label>
                {connection && (
                  <a
                    className="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(connection.email_address)}#all/${encodeURIComponent(e.gmail_id)}`}
                  >
                    Open in Gmail
                  </a>
                )}
              </ActionForm>
            </article>
          ))
        ) : (
          <p className="muted">Geen mails in deze selectie.</p>
        )}
      </section>
    </>
  );
}
