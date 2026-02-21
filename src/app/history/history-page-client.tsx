"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";

type RunSummary = {
  runId: string;
  createdAt: string;
  problem: string;
  fastVariant: {
    proofMarkdown: string;
    auditStatus: string;
    strategy: string;
  } | null;
  explainVariant: {
    proofMarkdown: string;
    auditStatus: string;
    strategy: string;
  } | null;
  statusSummary: string;
};

export function HistoryPageClient() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/proof/history", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load history.");
        }

        const payload = (await response.json()) as { runs?: RunSummary[] };
        setRuns(payload.runs ?? []);
      } catch (historyError) {
        setError(historyError instanceof Error ? historyError.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  return (
    <main className="app-grid min-h-screen px-4 py-10 sm:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <MagicLogicLogo />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-white">Proof History</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link className="rounded border border-border px-3 py-1.5 text-xs text-zinc-300 hover:text-white" href="/ide">
              Back to IDE
            </Link>
          </div>
        </div>

        {isLoading ? <p className="text-sm text-zinc-400">Loading history...</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {!isLoading && !error && runs.length === 0 ? (
          <p className="text-sm text-zinc-400">No saved runs yet.</p>
        ) : null}

        <div className="grid gap-4">
          {runs.map((run) => (
            <article className="surface space-y-3 p-4" key={run.runId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-zinc-400">Run: {run.runId}</p>
                <p className="text-xs text-zinc-400">{new Date(run.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-sm text-zinc-100">{run.problem}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-border p-3">
                  <p className="mb-1 font-mono text-xs uppercase tracking-[0.15em] text-zinc-400">Fast Math</p>
                  <p className="text-xs text-zinc-400">
                    {run.fastVariant
                      ? `${run.fastVariant.auditStatus} · ${run.fastVariant.strategy}`
                      : "Not available"}
                  </p>
                </div>
                <div className="rounded border border-border p-3">
                  <p className="mb-1 font-mono text-xs uppercase tracking-[0.15em] text-zinc-400">Deep Dive</p>
                  <p className="text-xs text-zinc-400">
                    {run.explainVariant
                      ? `${run.explainVariant.auditStatus} · ${run.explainVariant.strategy}`
                      : "Pending or unavailable"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{run.statusSummary}</p>
                <Link
                  className="rounded border border-border px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
                  href={`/history/${run.runId}`}
                >
                  Open run
                </Link>
              </div>
            </article>
          ))}
        </div>

        <SiteFooter />
      </section>
    </main>
  );
}
