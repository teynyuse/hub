import { dashboardData } from "@/features/data/queries";
import { Dashboard } from "@/features/dashboard/dashboard";
export default async function Home() {
  return <Dashboard data={await dashboardData()} />;
}
