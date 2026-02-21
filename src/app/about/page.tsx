import type { Metadata } from "next";
import Link from "next/link";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <main className="about-stage min-h-screen px-4 py-6 sm:px-8 sm:py-8">
      <section className="mx-auto w-full max-w-6xl">
        <header className="about-nav mb-6">
          <MagicLogicLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link className="about-nav-btn" href="/">
              Open IDE
            </Link>
          </div>
        </header>

        <div className="about-sections">
          <section className="about-panel about-reveal">
            <p className="about-eyebrow">MagicLogic</p>
            <h1 className="about-hero">
              Understand math proofs
              <br />
              like never before.
            </h1>
            <p className="about-subcopy">
              Turn messy math-English into a clean Plan, formal Proof, and strict Audit in seconds.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="about-solid-btn" href="/">
                Try the IDE
              </Link>
              <a className="about-outline-btn" href="#ide-showcase">
                See how it works
              </a>
            </div>
          </section>

          <section className="about-panel about-reveal" id="ide-showcase">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <p className="about-eyebrow">Try It Yourself</p>
                <h2 className="about-section-title">From problem statement to rigorous proof flow.</h2>
                <p className="about-subcopy">
                  Write your theorem prompt, pick your mode, and watch MagicLogic produce formal structure with
                  live reasoning.
                </p>
                <Link className="about-solid-btn" href="/">
                  Open IDE
                </Link>
              </div>

              <div className="about-ide-preview">
                <p className="about-terminal-line">{"> Initializing Planner..."}</p>
                <p className="about-terminal-line">{"> Strategy: CONTRADICTION_GENERAL"}</p>
                <p className="about-terminal-line">{"> Drafting proof..."}</p>
                <p className="about-terminal-line">{"> Critic: PASS"}</p>
                <p className="about-terminal-line about-terminal-line--muted">{"> Final output ready."}</p>
              </div>
            </div>
          </section>

          <section className="about-panel about-reveal">
            <p className="about-eyebrow">Join In</p>
            <h2 className="about-section-title">Build better proof intuition with a serious tool.</h2>
            <p className="about-subcopy">
              Sign in to save runs, compare variants, and keep improving your logical thinking workflow.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="about-solid-btn" href="/login">
                Join MagicLogic
              </Link>
              <Link className="about-outline-btn" href="/">
                Try as guest
              </Link>
            </div>
          </section>
        </div>

        <div className="mt-8">
          <SiteFooter />
        </div>
      </section>
    </main>
  );
}
