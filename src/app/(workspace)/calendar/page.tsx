import { getRows, getProfile } from "@/features/data/queries";
import type { CalendarEvent } from "@/lib/types";
import { RecordActions } from "@/components/record-actions";
import { EventForm } from "@/features/calendar/event-form";
export default async function Calendar() {
  const [events, profile] = await Promise.all([
    getRows<CalendarEvent>("calendar_events", "starts_at", true),
    getProfile(),
  ]);
  const format = (value: string) =>
    new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: profile.timezone,
    }).format(new Date(value));
  return (
    <>
      <div className="page-heading">
        <h1>Calendar</h1>
        <span className="muted">{profile.timezone}</span>
      </div>
      <div className="columns">
        <section className="panel">
          <h2>Afspraken</h2>
          {events.length ? (
            <ul className="item-list">
              {events.map((e) => (
                <li key={e.id}>
                  <div>
                    <p>{e.title}</p>
                    <span>
                      {format(e.starts_at)}
                      {e.ends_at ? ` – ${format(e.ends_at)}` : ""}
                    </span>
                  </div>
                  <RecordActions id={e.id} table="calendar_events" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nog geen afspraken toegevoegd.</p>
          )}
        </section>
        <aside className="panel">
          <h2>Afspraak toevoegen</h2>
          <EventForm />
        </aside>
      </div>
    </>
  );
}
