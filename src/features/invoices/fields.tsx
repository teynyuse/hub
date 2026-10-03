import type { Invoice, RecurringCost } from "@/lib/types";
import { costCategories } from "./extract";
export function InvoiceFields({
  value,
  recurring = false,
  month,
}: {
  value?: Invoice | RecurringCost;
  recurring?: boolean;
  month: string;
}) {
  return (
    <>
      {value && <input type="hidden" name="id" value={value.id} />}
      <label>
        Naam
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={value?.title}
          placeholder="Elektriciteit"
        />
      </label>
      <label>
        Leverancier
        <input
          name="supplier"
          maxLength={100}
          defaultValue={value?.supplier}
          placeholder="Bijvoorbeeld Engie"
        />
      </label>
      <label>
        Soort kost
        <select name="cost_category" defaultValue={value?.cost_category ?? "Overig"}>
          {costCategories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Bedrag (€)
        <input
          name="amount"
          inputMode="decimal"
          required={!value || recurring}
          defaultValue={value?.amount_cents != null ? (value.amount_cents / 100).toFixed(2) : ""}
          placeholder="0,00"
        />
      </label>
      {recurring ? (
        <>
          <label>
            Betaaldag van de maand
            <select
              name="day_of_month"
              defaultValue={value && "day_of_month" in value ? value.day_of_month : 1}
            >
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Dag {day}
                </option>
              ))}
            </select>
            <span className="field-help">Dag 31 wordt de laatste dag in een kortere maand.</span>
          </label>
          <label>
            Vanaf maand
            <input
              name="start_month"
              type="month"
              required
              defaultValue={value && "start_month" in value ? value.start_month.slice(0, 7) : month}
            />
          </label>
        </>
      ) : (
        <label>
          Te betalen voor
          <input
            name="due_date"
            type="date"
            required={!value}
            defaultValue={value && "due_date" in value ? (value.due_date ?? "") : ""}
          />
        </label>
      )}
    </>
  );
}
