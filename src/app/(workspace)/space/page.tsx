import Link from "next/link";
import { getRows, getProfile } from "@/features/data/queries";
import type { Page } from "@/lib/types";
import { createPage } from "@/features/space/actions";
import { ActionForm } from "@/components/action-form";
import { RecordActions } from "@/components/record-actions";
import { dateLabel } from "@/lib/format";
export default async function Space() {
  const [pages, profile] = await Promise.all([getRows<Page>("pages", "updated_at"), getProfile()]);
  return (
    <>
      <div className="page-heading">
        <h1>Space</h1>
      </div>
      <div className="columns">
        <section className="panel">
          <h2>Mijn pagina’s</h2>
          {pages.length ? (
            <ul className="item-list">
              {pages.map((p) => (
                <li key={p.id}>
                  <div>
                    <Link className="text-link" href={`/space/${p.id}`}>
                      {p.title}
                    </Link>
                    <p className="muted">Bijgewerkt {dateLabel(p.updated_at, profile.timezone)}</p>
                  </div>
                  <RecordActions id={p.id} table="pages" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Maak je eerste pagina voor notities, plannen of ideeën.</p>
          )}
        </section>
        <aside className="panel">
          <h2>Nieuwe pagina</h2>
          <ActionForm action={createPage} submit="Pagina maken">
            <label>
              Titel
              <input name="title" required maxLength={200} />
            </label>
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
