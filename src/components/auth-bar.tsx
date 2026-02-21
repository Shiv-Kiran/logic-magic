"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { buildLoginRedirect } from "@/lib/auth/redirect";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/theme-toggle";

type AuthState = {
  loading: boolean;
  email: string | null;
};

type AuthBarProps = {
  signOutRedirectTo?: string;
};

export function AuthBar({ signOutRedirectTo = "/" }: AuthBarProps) {
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
    window.location.href = signOutRedirectTo;
  };

  const historyHref = authState.email ? "/history" : buildLoginRedirect("/history");
  const statusText = authState.loading
    ? "Checking session..."
    : authState.email
      ? `Signed in as ${authState.email}`
      : "Guest mode";

  return (
    <div className="ide-topbar">
      <MagicLogicLogo />
      <div className="ide-topbar-right">
        <div className="ide-topbar-controls text-xs">
          <ThemeToggle />
          <Link className="rounded border border-border px-3 py-1.5 text-zinc-300 hover:text-white" href={historyHref}>
            History
          </Link>
          {authState.email ? (
            <button className="auth-strong" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <Link className="auth-strong" href="/login">
              Sign in
            </Link>
          )}
        </div>
        <p className="ide-topbar-status text-xs text-zinc-400">{statusText}</p>
      </div>
    </div>
  );
}
