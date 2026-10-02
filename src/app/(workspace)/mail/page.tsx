import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { getRows, getProfile } from "@/features/data/queries";
import { gmailConfigured, canReadMail } from "@/features/mail/google";
import { connectGmail, syncGmail, disconnectGmail } from "@/features/mail/actions";
import { isRelevantMail, CLASSIFICATION_VERSION } from "@/features/mail/classify";
import { ActionForm } from "@/components/action-form";
import type { Email } from "@/lib/types";
import { dateLabel } from "@/lib/format";
export const maxDuration = 300;
export default async function Mail({
  searchParams,
}: {
  searchParams: Promise<{
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
  let connection: {
    email_address: string;
    last_synced_at: string | null;
    granted_scope: string;
  } | null = null;
  if (configured) {
    const { data } = await adminClient()
      .from("gmail_connections")
      .select("email_address,last_synced_at,granted_scope")
      .eq("user_id", user.id)
      .maybeSingle();
    connection = data;
  }
  const needsReconnect = connection && !canReadMail(connection.granted_scope);
  const visible = emails.filter(isRelevantMail);
  return (
    <>
      <div className="page-heading">
        <h1>Mail</h1>
        {connection && !needsReconnect && (
          <ActionForm action={syncGmail} submit="Synchroniseren" className="inline-form" />
        )}
      </div>
      <p className="muted">
        Alleen facturen en betalingsverzoeken voor energie, water, telecom, verzekeringen en
        bijdragen.
      </p>
      {params.error && (
        <p className="error" role="alert">
          {params.error === "scope"
            ? "Geef Hub toestemming om mailinhoud te lezen en koppel Gmail opnieuw."
            : "Gmail koppelen lukte niet. Controleer je Google-instellingen en probeer opnieuw."}
        </p>
      )}
      {params.connected && (
        <p role="status">Gmail is gekoppeld. Klik op Synchroniseren om je facturen op te halen.</p>
      )}
      <div className="panel section-space">
        <div className="row">
          {connection ? (
            <>
              <span>{connection.email_address}</span>
              <form action={connectGmail}>
                <button>{needsReconnect ? "Gmail opnieuw koppelen" : "Opnieuw koppelen"}</button>
              </form>
              <ActionForm action={disconnectGmail} submit="Ontkoppelen" className="inline-form" />
            </>
          ) : configured ? (
            <form action={connectGmail}>
              <button className="primary">Gmail koppelen</button>
            </form>
          ) : (
            <p className="muted">Gmail is nog niet ingesteld.</p>
          )}
        </div>
        {needsReconnect && (
          <p className="section-space">
            Koppel Gmail één keer opnieuw, zodat Hub de tekst kan lezen en je mails automatisch kan
            sorteren.
          </p>
        )}
        {connection && !needsReconnect && (
          <p className="muted section-space">
            {connection.last_synced_at
              ? `Laatst bijgewerkt: ${dateLabel(connection.last_synced_at, profile.timezone)}.`
              : "Nog niet gesynchroniseerd."}{" "}
            Per synchronisatie worden maximaal de laatste 200 inboxmails ingedeeld. Dit kan ongeveer
            twee minuten duren. Er wordt niets verwijderd of aangepast in Gmail.
          </p>
        )}
      </div>
      {emails.length > 0 &&
        !emails.some((e) => e.classification_version === CLASSIFICATION_VERSION) && (
          <p className="muted section-space">
            Klik op Synchroniseren om je laatste 200 inboxmails opnieuw te controleren met de
            facturenfilter.
          </p>
        )}
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
              <p>
                <span className="badge">
                  {e.classification_version === CLASSIFICATION_VERSION
                    ? e.category
                    : "Nog niet geanalyseerd"}
                </span>
                {e.important && <span className="badge">Belangrijk</span>}
              </p>
              {e.snippet && <p>{e.snippet}</p>}
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
            </article>
          ))
        ) : (
          <p className="muted">Geen facturen voor vaste kosten gevonden.</p>
        )}
      </section>
    </>
  );
}
