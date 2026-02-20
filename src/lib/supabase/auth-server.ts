import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { assertSupabasePublicConfig } from "@/lib/supabase/env";

export async function getSupabaseServerAuthClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = assertSupabasePublicConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        cookieStore.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options) {
        cookieStore.set({
          name,
          value: "",
          ...options,
          maxAge: 0,
        });
      },
    },
  });
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const client = await getSupabaseServerAuthClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}

