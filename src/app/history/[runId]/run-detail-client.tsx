"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { FollowupBox } from "@/components/followup-box";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlanJSON, ProofMode, VariantRole } from "@/lib/logic/types";

type RunVariant = {
  variantRole: VariantRole;
  mode: ProofMode;
  strategy: string;
  proofMarkdown: string;
  planJson: PlanJSON;
  audit: {
    status: string;
    attempts: number;
    critiques: string[];
    final_verdict: string;
  };
  attempts: number;
};

type RunDetailResponse = {
  runId: string;
  createdAt: string;
  problem: string;
  variants: RunVariant[];
};

type HistoryRunDetailClientProps = {
  runId: string;
};

function FullscreenIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 8h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function HistoryRunDetailClient({ runId }: HistoryRunDetailClientProps) {
  const [runDetail, setRunDetail] = useState<RunDetailResponse | null>(null);
  const [activeRole, setActiveRole] = useState<VariantRole>("FAST_PRIMARY");
  const [isProofFullscreen, setIsProofFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/proof/history/${runId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (response.status === 403) {
          setError("You do not have access to this run.");
          setIsLoading(false);
          return;
        }

        if (response.status === 404) {
          setError("Run not found.");
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load run details.");
        }

        const payload = (await response.json()) as RunDetailResponse;
        setRunDetail(payload);
        const hasFast = payload.variants.some((variant) => variant.variantRole === "FAST_PRIMARY");
        setActiveRole(hasFast ? "FAST_PRIMARY" : payload.variants[0]?.variantRole ?? "FAST_PRIMARY");
      } catch (detailError) {
        setError(detailError instanceof Error ? detailError.message : "Unknown error.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [runId]);

  const activeVariant = useMemo(() => {
    if (!runDetail) {
      return null;
    }

    return (
      runDetail.variants.find((variant) => variant.variantRole === activeRole) ??
      runDetail.variants[0] ??
      null
    );
  }, [activeRole, runDetail]);

  const hasDeepDive = Boolean(
    runDetail?.variants.some((variant) => variant.variantRole === "BACKGROUND_QUALITY"),
  );

  return (
    <main className="app-grid min-h-screen px-4 py-10 sm:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <MagicLogicLogo />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-white">Run Detail</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              className="rounded border border-border px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
              href="/history"
            >
              Back to History
            </Link>
            <Link
              className="rounded border border-border px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
              href="/"
            >
              Open IDE
            </Link>
          </div>
        </div>

        {isLoading ? <p className="text-sm text-zinc-400">Loading run...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {runDetail ? (
          <>
            <article className="surface space-y-3 p-5 sm:p-6">
              <p className="font-mono text-xs text-zinc-500">Run: {runId}</p>
              <p className="text-zinc-100">{runDetail.problem}</p>
              <p className="text-xs text-zinc-500">{new Date(runDetail.createdAt).toLocaleString()}</p>
            </article>

            <article className="surface space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="section-title">Saved Proof</h2>
                <div className="flex gap-2">
                  <button
                    className={`rounded border px-3 py-1 text-xs ${
                      activeRole === "FAST_PRIMARY" ? "border-white text-white" : "border-border text-zinc-400"
                    }`}
                    type="button"
                    onClick={() => setActiveRole("FAST_PRIMARY")}
                  >
                    Fast Math
                  </button>
                  {hasDeepDive ? (
                    <button
                      className={`rounded border px-3 py-1 text-xs ${
                        activeRole === "BACKGROUND_QUALITY"
                          ? "border-white text-white"
                          : "border-border text-zinc-400"
                      }`}
                      type="button"
                      onClick={() => setActiveRole("BACKGROUND_QUALITY")}
                    >
                      Deep Dive
                    </button>
                  ) : null}
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setIsProofFullscreen(true)}
                    aria-label="Open proof fullscreen"
                    title="Open proof fullscreen"
                  >
                    <FullscreenIcon />
                  </button>
                </div>
              </div>

              {activeVariant ? (
                <>
                  <p className="font-mono text-xs text-zinc-500">
                    {activeVariant.variantRole === "FAST_PRIMARY" ? "Primary" : "Deep Dive"} |{" "}
                    {activeVariant.mode} | {activeVariant.strategy}
                  </p>
                  <div className="proof-scroll-panel proof-markdown">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {activeVariant.proofMarkdown}
                    </ReactMarkdown>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-400">This variant is not available for the run.</p>
              )}
            </article>

            <article className="surface space-y-4 p-5 sm:p-6">
              <h2 className="section-title">The Plan</h2>
              {activeVariant ? (
                <>
                  <p className="font-mono text-sm text-zinc-300">
                    Strategy: {activeVariant.planJson.meta.strategy}
                  </p>
                  <p className="text-sm text-zinc-200">Goal: {activeVariant.planJson.setup.goal}</p>
                  <details className="plan-json-box rounded-lg border border-border p-3">
                    <summary className="cursor-pointer font-mono text-xs text-zinc-400">
                      View full plan JSON
                    </summary>
                    <pre className="mt-3 overflow-x-auto font-mono text-xs text-zinc-300">
                      {JSON.stringify(activeVariant.planJson, null, 2)}
                    </pre>
                  </details>
                </>
              ) : null}
            </article>

            <article className="surface space-y-4 p-5 sm:p-6">
              <h2 className="section-title">The Audit</h2>
              {activeVariant ? (
                <>
                  <p className="font-mono text-sm text-zinc-200">Status: {activeVariant.audit.status}</p>
                  <p className="text-sm text-zinc-300">Attempts: {activeVariant.audit.attempts}</p>
                  <p className="text-sm text-zinc-200">{activeVariant.audit.final_verdict}</p>
                  {activeVariant.audit.critiques.length > 0 ? (
                    <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-300">
                      {activeVariant.audit.critiques.map((critique) => (
                        <li key={critique}>{critique}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-zinc-300">No remaining gaps.</p>
                  )}
                </>
              ) : null}
            </article>

            <FollowupBox
              context={
                activeVariant
                  ? {
                      runId: runDetail.runId,
                      variantRole: activeVariant.variantRole,
                      modeHint: activeVariant.mode,
                    }
                  : undefined
              }
              title="Follow-up"
              defaultUseContext
            />

            {isProofFullscreen ? (
              <div className="proof-fullscreen-overlay">
                <div className="proof-fullscreen-card">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-400">
                      Saved Proof View
                    </p>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setIsProofFullscreen(false)}
                      aria-label="Close proof fullscreen"
                      title="Close"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  {activeVariant ? (
                    <div className="proof-fullscreen-scroll proof-markdown">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {activeVariant.proofMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400">No proof content for this variant.</p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
