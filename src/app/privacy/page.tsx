import type { Metadata } from "next";
import Link from "next/link";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <main className="about-stage min-h-screen px-4 py-6 sm:px-8 sm:py-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="about-nav">
          <MagicLogicLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link className="about-nav-btn" href="/ide">
              Open IDE
            </Link>
          </div>
        </header>

        <article className="marketing-panel space-y-4 p-6">
          <h1 className="text-2xl font-semibold text-white">Privacy</h1>
          <p className="text-zinc-300">
            MagicLogic processes submitted prompts to generate mathematical reasoning outputs.
          </p>
          <p className="text-zinc-300">
            If you sign in, successful proof variants are stored in your account history so you can revisit them.
            Anonymous usage is rate-limited and may be logged for abuse prevention.
          </p>
          <p className="text-zinc-300">
            Do not submit sensitive personal, financial, or regulated data in prompts.
          </p>
        </article>

        <SiteFooter />
      </section>
    </main>
  );
}
