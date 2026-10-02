import { isConfigured } from "@/lib/env";
import { redirect } from "next/navigation";
export default function Setup() {
  if (isConfigured()) redirect("/login");
  return (
    <main className="setup-container">
      <h1>Hub instellen</h1>
      <p className="section-space">De app heeft nog geen verbinding met je Supabase-project.</p>
      <ol>
        <li>
          Maak een Supabase-project en voer het SQL-bestand in <code>supabase/migrations</code> uit
          in de SQL Editor.
        </li>
        <li>
          Kopieer <code>.env.example</code> naar <code>.env.local</code>.
        </li>
        <li>Vul je Supabase URL en publishable key in.</li>
        <li>
          Herstart <code>npm run dev</code> en maak je account.
        </li>
      </ol>
      <p>
        De volledige stappen, ook voor Gmail, staan in <code>README.md</code>.
      </p>
    </main>
  );
}
