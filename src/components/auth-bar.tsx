"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { buildLoginRedirect } from "@/lib/auth/redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/theme-toggle";

type AuthState = {
  loading: boolean;
  email: string | null;
};

export function AuthBar() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [authState, setAuthState] = useState<AuthState>({
    loading: Boolean(supabase),
    email: null,
  });

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setAuthState({
        loading: false,
        email: user?.email ?? null,
      });
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setAuthState({
        loading: false,
        email: session?.user?.email ?? null,
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const historyHref = authState.email ? "/history" : buildLoginRedirect("/history");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="text-xs text-zinc-400">
        {authState.loading
          ? "Checking session..."
          : authState.email
            ? `Signed in as ${authState.email}`
            : "Guest mode"}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <ThemeToggle />
        <Link className="rounded border border-border px-3 py-1.5 text-zinc-300 hover:text-white" href={historyHref}>
          History
        </Link>
        {authState.email ? (
          <button
            className="auth-strong"
            type="button"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        ) : (
          <Link
            className="auth-strong"
            href="/login"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

