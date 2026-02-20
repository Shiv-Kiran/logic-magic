"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/supabase/env";

let cachedClient: ReturnType<typeof createBrowserClient> | null | undefined;

export function getSupabaseBrowserClient() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const url = getSupabasePublicUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createBrowserClient(url, anonKey);

  return cachedClient;
}

