import { getRows, getProfile } from "@/features/data/queries";
import type { FileRecord } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { uploadFile, deleteFile } from "@/features/files/actions";
import { dateLabel } from "@/lib/format";
export default async function Files() {
  const [files, profile] = await Promise.all([
    getRows<FileRecord>("files", "created_at"),
    getProfile(),
  ]);
  return (
    <>
      <div className="page-heading">
        <h1>Files</h1>
      </div>
      <div className="columns">
        <section className="panel">
          <h2>Mijn bestanden</h2>
          {files.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Naam</th>
                    <th>Grootte</th>
                    <th>Datum</th>
                    <th>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td className="file-name">
                        <a className="text-link" href={`/api/files/${f.id}`}>
                          {f.name}
                        </a>
                      </td>
                      <td>{(f.size_bytes / 1024).toFixed(0)} KB</td>
                      <td>{dateLabel(f.created_at, profile.timezone)}</td>
                      <td>
                        <ActionForm
                          action={deleteFile}
                          submit="Verwijderen"
                          className="inline-form"
                        >
                          <input type="hidden" name="id" value={f.id} />
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Je hebt nog geen bestanden opgeslagen.</p>
          )}
        </section>
        <aside className="panel">
          <h2>Bestand bewaren</h2>
          <ActionForm action={uploadFile} submit="Uploaden">
            <label>
              Bestand
              <input type="file" name="file" required />
            </label>
            <p className="muted">Maximaal 4 MB per bestand.</p>
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
