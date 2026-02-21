import type { Metadata } from "next";
import Link from "next/link";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
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

        <article className="marketing-panel marketing-panel--about-width space-y-4 p-6">
          <h1 className="text-2xl font-semibold text-white">Terms</h1>
          <p className="text-zinc-300">
            MagicLogic is provided as-is for educational and productivity use. Generated proofs are model outputs
            and may contain mistakes.
          </p>
          <p className="text-zinc-300">
            You are responsible for verifying correctness before academic, professional, or high-stakes use.
          </p>
          <p className="text-zinc-300">
            Abuse, scraping, or attempts to bypass limits may result in request denial.
          </p>
        </article>

        <SiteFooter />
      </section>
    </main>
  );
}
