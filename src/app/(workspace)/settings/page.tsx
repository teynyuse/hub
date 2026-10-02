import { getProfile } from "@/features/data/queries";
import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { updateProfile } from "@/features/data/actions";
import { signOut } from "@/features/auth/actions";
export default async function Settings() {
  const profile = await getProfile();
  const { user } = await requireUser();
  return (
    <>
      <div className="page-heading">
        <h1>Settings</h1>
      </div>
      <div className="columns">
        <section className="panel">
          <h2>Profiel</h2>
          <ActionForm action={updateProfile}>
            <label>
              Naam
              <input
                name="display_name"
                defaultValue={profile.display_name}
                required
                maxLength={80}
              />
            </label>
            <label>
              Munt
              <select name="currency" defaultValue={profile.currency}>
                {["EUR", "USD", "GBP", "BGN"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="muted">
              Alle bedragen gebruiken dezelfde munt. Wijzigen voert geen wisselkoersconversie uit.
            </p>
            <label>
              Tijdzone
              <input name="timezone" defaultValue={profile.timezone} required list="timezones" />
            </label>
            <datalist id="timezones">
              {["Europe/Brussels", "Europe/London", "Europe/Sofia", "America/New_York"].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </ActionForm>
        </section>
        <aside className="panel stack">
          <h2>Account</h2>
          <p className="muted">{user.email}</p>
          <form action={signOut}>
            <button>Uitloggen</button>
          </form>
        </aside>
      </div>
    </>
  );
}
