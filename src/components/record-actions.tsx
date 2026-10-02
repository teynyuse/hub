import { ActionForm } from "./action-form";
import { updateRecord } from "@/features/data/actions";
export function RecordActions({
  id,
  table,
  toggle,
}: {
  id: string;
  table: "tasks" | "payments" | "transactions" | "calendar_events" | "pages";
  toggle?: string;
}) {
  return (
    <div className="row">
      {toggle && (
        <ActionForm action={updateRecord} submit={toggle} className="inline-form">
          <input name="id" type="hidden" value={id} />
          <input name="table" type="hidden" value={table} />
          <input name="operation" type="hidden" value="toggle" />
        </ActionForm>
      )}
      <ActionForm action={updateRecord} submit="Verwijderen" className="inline-form">
        <input name="id" type="hidden" value={id} />
        <input name="table" type="hidden" value={table} />
        <input name="operation" type="hidden" value="delete" />
      </ActionForm>
    </div>
  );
}
