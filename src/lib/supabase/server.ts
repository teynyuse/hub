import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
export async function createClient() {
  const env = publicEnv();
  const jar = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* Server Components cannot set cookies; proxy refreshes them. */
        }
      },
    },
  });
}
