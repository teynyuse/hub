import { getProfile, getRows, getTransactions } from "@/features/data/queries";
import { ActionForm } from "@/components/action-form";
import { RecordActions } from "@/components/record-actions";
import { addTransaction, addPayment } from "@/features/data/actions";
import { ExpenseChart } from "@/features/money/chart";
import { localDate, money, dateLabel } from "@/lib/format";
import type { Payment } from "@/lib/types";
export default async function Money({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const profile = await getProfile();
  const today = localDate(profile.timezone);
  const params = await searchParams;
  const month =
    params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const [transactions, payments] = await Promise.all([
    getTransactions(month),
    getRows<Payment>("payments", "due_date", true),
  ]);
  const income = transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount_cents, 0);
  const expense = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount_cents, 0);
  const grouped = transactions
    .filter((t) => t.kind === "expense")
    .reduce<Record<string, number>>(
      (all, t) => ({ ...all, [t.category]: (all[t.category] ?? 0) + t.amount_cents }),
      {},
    );
  return (
    <>
      <div className="page-heading">
        <h1>Money</h1>
        <form className="filter-form">
          <label>
            Maand
            <input type="month" name="month" defaultValue={month} />
          </label>
          <button>Tonen</button>
        </form>
      </div>
      <div className="columns">
        <div className="stack">
          <section className="panel">
            <dl className="totals">
              <div>
                <dt>Inkomsten</dt>
                <dd>{money(income, profile.currency)}</dd>
              </div>
              <div>
                <dt>Uitgaven</dt>
                <dd>{money(expense, profile.currency)}</dd>
              </div>
              <div>
                <dt>Verschil</dt>
                <dd>{money(income - expense, profile.currency)}</dd>
              </div>
            </dl>
            <p className="muted">Gebaseerd op ingevoerde transacties. Dit is geen banksaldo.</p>
            <ExpenseChart
              currency={profile.currency}
              data={Object.entries(grouped).map(([category, cents]) => ({ category, cents }))}
            />
          </section>
          <section className="panel">
            <h2>Transacties</h2>
            {transactions.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Titel</th>
                      <th>Datum</th>
                      <th>Categorie</th>
                      <th>Bedrag</th>
                      <th>Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{t.title}</td>
                        <td>{dateLabel(t.date, profile.timezone)}</td>
                        <td>{t.category}</td>
                        <td className="numeric">
                          {t.kind === "income" ? "+" : "−"}
                          {money(t.amount_cents, profile.currency)}
                        </td>
                        <td>
                          <RecordActions id={t.id} table="transactions" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Nog geen transacties deze maand.</p>
            )}
          </section>
          <section className="panel">
            <h2>Betalingen</h2>
            <p className="muted">
              Als betaald markeren registreert geen uitgave. Voeg die apart toe bij transacties.
            </p>
            {payments.length ? (
              <ul className="item-list">
                {payments.map((p) => (
                  <li key={p.id}>
                    <div>
                      <p>
                        {p.title} · {money(p.amount_cents, profile.currency)}
                      </p>
                      <span>
                        {dateLabel(p.due_date, profile.timezone)} ·{" "}
                        {p.status === "paid" ? "Betaald" : p.due_date < today ? "Te laat" : "Open"}
                      </span>
                    </div>
                    <RecordActions
                      id={p.id}
                      table="payments"
                      toggle={p.status === "paid" ? "Heropenen" : "Betaald"}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nog geen betalingen toegevoegd.</p>
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="panel">
            <h2>Transactie toevoegen</h2>
            <ActionForm action={addTransaction} submit="Toevoegen">
              <label>
                Titel
                <input name="title" required maxLength={200} />
              </label>
              <label>
                Bedrag ({profile.currency})
                <input name="amount" inputMode="decimal" placeholder="0,00" required />
              </label>
              <label>
                Type
                <select name="kind">
                  <option value="expense">Uitgave</option>
                  <option value="income">Inkomst</option>
                </select>
              </label>
              <label>
                Categorie
                <input
                  name="category"
                  defaultValue="Overig"
                  required
                  maxLength={200}
                  list="money-categories"
                />
              </label>
              <datalist id="money-categories">
                {["Wonen", "Eten", "Transport", "Shopping", "Abonnementen", "Loon", "Overig"].map(
                  (c) => (
                    <option key={c} value={c} />
                  ),
                )}
              </datalist>
              <label>
                Datum
                <input name="date" type="date" defaultValue={today} required />
              </label>
            </ActionForm>
          </section>
          <section className="panel">
            <h2>Betaling toevoegen</h2>
            <ActionForm action={addPayment} submit="Toevoegen">
              <label>
                Titel
                <input name="title" required maxLength={200} />
              </label>
              <label>
                Bedrag ({profile.currency})<input name="amount" inputMode="decimal" required />
              </label>
              <label>
                Vervaldatum
                <input name="due_date" type="date" required />
              </label>
            </ActionForm>
          </section>
        </aside>
      </div>
    </>
  );
}
