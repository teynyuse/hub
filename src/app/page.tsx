import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
export default function Page() {
  redirect(isConfigured() ? "/home" : "/setup");
}
