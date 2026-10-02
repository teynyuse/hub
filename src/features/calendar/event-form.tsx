"use client";
import { ActionForm } from "@/components/action-form";
import { addEvent } from "@/features/data/actions";
async function createEvent(state: Parameters<typeof addEvent>[0], form: FormData) {
  for (const key of ["starts_at", "ends_at"]) {
    const value = form.get(key);
    if (value) form.set(key, new Date(String(value)).toISOString());
  }
  return addEvent(state, form);
}
export function EventForm() {
  return (
    <ActionForm action={createEvent} submit="Afspraak toevoegen">
      <label>
        Titel
        <input name="title" required maxLength={200} />
      </label>
      <label>
        Start
        <input name="starts_at" type="datetime-local" required />
      </label>
      <label>
        Einde (optioneel)
        <input name="ends_at" type="datetime-local" />
      </label>
      <p className="muted">Tijden worden ingevoerd in de tijdzone van dit apparaat.</p>
    </ActionForm>
  );
}
