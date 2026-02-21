"use client";

import { useMemo, useState } from "react";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginPageClientProps = {
  nextPath: string;
};

export function LoginPageClient({ nextPath }: LoginPageClientProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setError(
        "Supabase auth public env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setError(null);
    setIsLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
    }
  };

  return (
    <main className="app-grid min-h-screen px-4 py-12">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        <article className="surface flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <MagicLogicLogo showWordmark={false} />
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-semibold text-white">Sign in to MagicLogic</h1>
          <p className="text-sm text-zinc-400">Google sign-in unlocks your saved proof history.</p>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button className="primary" type="button" onClick={handleGoogleSignIn} disabled={isLoading}>
            {isLoading ? "Redirecting..." : "Continue with Google"}
          </button>
        </article>
        <SiteFooter />
      </section>
    </main>
  );
}
