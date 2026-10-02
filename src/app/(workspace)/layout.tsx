import { Sidebar } from "@/components/sidebar";
import { getProfile } from "@/features/data/queries";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <>
      <a className="skip-link" href="#main">
        Naar inhoud
      </a>
      <Sidebar name={profile.display_name} />
      <main className="main" id="main">
        {children}
      </main>
    </>
  );
}
