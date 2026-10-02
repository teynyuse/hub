import { getRows, getProfile } from "@/features/data/queries";
import type { Task } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { RecordActions } from "@/components/record-actions";
import { addTask } from "@/features/data/actions";
import { dateLabel } from "@/lib/format";
export default async function Tasks() {
  const [tasks, profile] = await Promise.all([getRows<Task>("tasks", "created_at"), getProfile()]);
  return (
    <>
      <div className="page-heading">
        <h1>Tasks</h1>
      </div>
      <div className="columns">
        <section className="panel">
          <h2>Mijn taken</h2>
          {tasks.length ? (
            <ul className="item-list">
              {tasks.map((t) => (
                <li key={t.id}>
                  <div>
                    <p style={{ textDecoration: t.done ? "line-through" : undefined }}>{t.title}</p>
                    <span>
                      {t.done ? "Afgerond" : "Open"}
                      {t.due_date ? ` · ${dateLabel(t.due_date, profile.timezone)}` : ""}
                    </span>
                  </div>
                  <RecordActions
                    id={t.id}
                    table="tasks"
                    toggle={t.done ? "Heropenen" : "Afronden"}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Je hebt nog geen taken.</p>
          )}
        </section>
        <aside className="panel">
          <h2>Taak toevoegen</h2>
          <ActionForm action={addTask} submit="Toevoegen">
            <label>
              Titel
              <input name="title" required maxLength={200} />
            </label>
            <label>
              Deadline (optioneel)
              <input type="date" name="due_date" />
            </label>
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
