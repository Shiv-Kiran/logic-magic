"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { AuthBar } from "@/components/auth-bar";
import { FollowupBox } from "@/components/followup-box";
import { MagicLogicLogo } from "@/components/magiclogic-logo";
import { SiteFooter } from "@/components/site-footer";
import { getDeepDiveStatusMessage, shouldShowDeepDiveTab } from "@/lib/ui/deep-dive";
import {
  FinalProofPayload,
  JobStatus,
  ProofMode,
  StreamEvent,
  UserIntent,
} from "@/lib/logic/types";

type StreamState = {
  plan: FinalProofPayload["plan"] | null;
  fastDraft: string;
  fastPayload: FinalProofPayload | null;
  explainPayload: FinalProofPayload | null;
  backgroundJob: {
    runId: string;
    jobId: string;
    mode: ProofMode;
    status: JobStatus;
    error?: string;
  } | null;
};

type ProofTab = "PRIMARY" | "DEEP_DIVE";

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

function formatStatusLine(message: string, attempt?: number): string {
  return attempt ? `> [Attempt ${attempt}] ${message}` : `> ${message}`;
}

function parseErrorMessage(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  ) {
    return "Request timed out while waiting for planner response.";
  }

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("aborted")) {
      return "Request timed out while waiting for planner response.";
    }

    return error.message;
  }

  return "Unexpected error";
}

export default function Home() {
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState("");
  const [userIntent, setUserIntent] = useState<UserIntent>("LEARNING");
  const [modePreference, setModePreference] = useState<ProofMode>("MATH_FORMAL");
  const [activeProofTab, setActiveProofTab] = useState<ProofTab>("PRIMARY");
  const [isProofFullscreen, setIsProofFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scopeReview, setScopeReview] = useState<{
    message: string;
    reason: string;
    suggestion: string;
  } | null>(null);
  const [logs, setLogs] = useState<string[]>(["> Ready."]);
  const [streamState, setStreamState] = useState<StreamState>({
    plan: null,
    fastDraft: "",
    fastPayload: null,
    explainPayload: null,
    backgroundJob: null,
  });
  const [autoScroll, setAutoScroll] = useState(true);

  const terminalRef = useRef<HTMLPreElement | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendLog = (line: string): void => {
    setLogs((previous) => {
      const next = [...previous, line];
      return next.slice(-200);
    });
  };

  useEffect(() => {
    if (!autoScroll || !terminalRef.current) {
      return;
    }

    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs, autoScroll]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (scopeReview) {
      setScopeReview(null);
    }
  }, [problem, attempt, userIntent, modePreference, scopeReview]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const applyStreamEvent = (event: StreamEvent): void => {
    switch (event.type) {
      case "status": {
        appendLog(formatStatusLine(event.message, event.attempt));
        return;
      }
      case "heartbeat": {
        appendLog(`> [${event.stage}] ${Math.floor(event.elapsed_ms / 1000)}s elapsed`);
        return;
      }
      case "plan": {
        appendLog("> Strategy planned successfully.");
        setStreamState((previous) => ({
          ...previous,
          plan: event.data,
        }));
        return;
      }
      case "draft_delta": {
        setStreamState((previous) => ({
          ...previous,
          fastDraft: previous.fastDraft + event.delta,
        }));
        return;
      }
      case "draft_complete": {
        appendLog(`> Draft completed for attempt ${event.attempt}.`);
        setStreamState((previous) => ({
          ...previous,
          fastDraft: event.markdown,
        }));
        return;
      }
      case "critique": {
        const summary = event.gaps.length > 0 ? event.gaps.join(" | ") : "No gaps reported.";
        appendLog(`> [Critic ${event.status}] ${summary}`);
        return;
      }
      case "final_fast": {
        appendLog("> Fast variant complete.");
        setStreamState((previous) => ({
          ...previous,
          plan: event.data.plan,
          fastDraft: event.data.proofMarkdown,
          fastPayload: event.data,
        }));
        return;
      }
      case "background_queued": {
        appendLog("> Deep Dive generation queued.");
        setStreamState((previous) => ({
          ...previous,
          backgroundJob: {
            runId: event.runId,
            jobId: event.jobId,
            mode: event.mode,
            status: "QUEUED",
          },
        }));
        return;
      }
      case "background_update": {
        if (event.status === "COMPLETED" && event.proof) {
          appendLog("> Deep Dive variant is ready.");
          setStreamState((previous) => ({
            ...previous,
            explainPayload: event.proof ?? previous.explainPayload,
            backgroundJob: {
              runId: event.runId,
              jobId: event.jobId,
              mode: event.mode,
              status: event.status,
              error: event.error,
            },
          }));
        } else {
          setStreamState((previous) => ({
            ...previous,
            backgroundJob: {
              runId: event.runId,
              jobId: event.jobId,
              mode: event.mode,
              status: event.status,
              error: event.error,
            },
          }));
        }

        return;
      }
      case "error": {
        appendLog(`> [Error] ${event.message}`);
        setErrorMessage(event.message);
        return;
      }
      default: {
        return;
      }
    }
  };

  const startBackgroundPolling = (jobId: string, runId: string): void => {
    stopPolling();

    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/proof/jobs/${jobId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          status: JobStatus;
          mode: ProofMode;
          error?: string;
          proof?: FinalProofPayload;
        };

        applyStreamEvent({
          type: "background_update",
          runId,
          jobId,
          status: payload.status,
          mode: payload.mode,
          proof: payload.proof,
          error: payload.error,
        });

        if (payload.status === "COMPLETED" || payload.status === "FAILED") {
          stopPolling();
        }
      } catch {
        // silent polling failures; next interval will retry
      }
    }, 2500);
  };

  const startGeneration = async (scopeOverride = false): Promise<void> => {
    if (!problem.trim()) {
      setErrorMessage("Problem statement is required.");
      return;
    }

    stopPolling();

    setIsLoading(true);
    setErrorMessage(null);
    if (scopeOverride) {
      setScopeReview(null);
    }
    setActiveProofTab("PRIMARY");
    setLogs(["> Initializing Planner..."]);
    setStreamState({
      plan: null,
      fastDraft: "",
      fastPayload: null,
      explainPayload: null,
      backgroundJob: null,
    });

    let requestTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const requestController = new AbortController();
      requestTimeout = setTimeout(() => {
        requestController.abort();
      }, 120_000);

      const response = await fetch("/api/proof/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problem,
          attempt: attempt.trim() || undefined,
          userIntent,
          modePreference,
          scopeOverride,
        }),
        signal: requestController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              code?: string;
              message?: string;
              reason?: string;
              suggestion?: string;
            }
          | null;

        if (response.status === 422 && payload?.code === "MATH_SCOPE_REVIEW") {
          setScopeReview({
            message: payload.message ?? "Prompt may be outside math scope.",
            reason: payload.reason ?? "The request is ambiguous.",
            suggestion: payload.suggestion ?? "Clarify the claim or theorem.",
          });
          appendLog("> Scope review requested before generation.");
          return;
        }

        if (response.status === 422 && payload?.code === "MATH_SCOPE_BLOCKED") {
          setScopeReview(null);
          throw new Error(payload.message ?? "Prompt is outside math scope.");
        }

        throw new Error(payload?.error ?? "Unable to start proof generation.");
      }

      setScopeReview(null);

      if (!response.body) {
        throw new Error("Streaming response body is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const parsed = JSON.parse(trimmed) as StreamEvent;
            applyStreamEvent(parsed);

            if (parsed.type === "background_queued") {
              startBackgroundPolling(parsed.jobId, parsed.runId);
            }
          } catch {
            appendLog("> [Warn] Ignored malformed stream line.");
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as StreamEvent;
          applyStreamEvent(parsed);

          if (parsed.type === "background_queued") {
            startBackgroundPolling(parsed.jobId, parsed.runId);
          }
        } catch {
          appendLog("> [Warn] Ignored trailing malformed stream line.");
        }
      }
    } catch (error) {
      const message = parseErrorMessage(error);
      setErrorMessage(message);
      appendLog(`> [Error] ${message}`);
    } finally {
      if (requestTimeout) {
        clearTimeout(requestTimeout);
      }
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await startGeneration(false);
  };

  const finalAudit = streamState.fastPayload?.audit;
  const hasOutput = Boolean(streamState.plan || streamState.fastDraft || streamState.fastPayload);
  const explainStatus = streamState.backgroundJob?.status;
  const showDeepDiveTab = shouldShowDeepDiveTab(Boolean(streamState.explainPayload));
  const deepDiveStatusMessage = getDeepDiveStatusMessage({
    hasDeepDivePayload: Boolean(streamState.explainPayload),
    jobStatus: explainStatus,
  });

  const activeProofMarkdown = useMemo(() => {
    if (activeProofTab === "PRIMARY") {
      return streamState.fastPayload?.proofMarkdown ?? streamState.fastDraft;
    }

    return streamState.explainPayload?.proofMarkdown ?? "";
  }, [activeProofTab, streamState.fastDraft, streamState.fastPayload, streamState.explainPayload]);

  const followupContext = useMemo(() => {
    const activePayload =
      activeProofTab === "DEEP_DIVE" && streamState.explainPayload
        ? streamState.explainPayload
        : streamState.fastPayload;

    if (!activePayload) {
      return {
        modeHint: modePreference,
      };
    }

    return {
      runId: activePayload.runId,
      variantRole: activePayload.variantRole,
      modeHint: activePayload.mode,
    };
  }, [activeProofTab, modePreference, streamState.explainPayload, streamState.fastPayload]);

  return (
    <div className="app-grid min-h-screen">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-8 sm:px-8 lg:py-12">
        <AuthBar />

        <header className="space-y-3">
          <MagicLogicLogo />
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Logic IDE for True Math</h1>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="surface p-5 sm:p-6">
            <h2 className="section-title mb-4">Input</h2>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Problem statement</span>
                <textarea
                  value={problem}
                  onChange={(inputEvent) => setProblem(inputEvent.target.value)}
                  placeholder="Prove that the sum of two even integers is even."
                  disabled={isLoading}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Messy attempt (optional)</span>
                <textarea
                  value={attempt}
                  onChange={(inputEvent) => setAttempt(inputEvent.target.value)}
                  placeholder="Let the integers be 2a and 2b, then their sum is 2(a+b)..."
                  disabled={isLoading}
                />
              </label>

              <div className="flex flex-wrap items-center gap-5 border-y border-border py-3 text-sm text-zinc-300">
                <span>User intent:</span>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="intent"
                    value="LEARNING"
                    checked={userIntent === "LEARNING"}
                    onChange={() => setUserIntent("LEARNING")}
                    disabled={isLoading}
                  />
                  <span>Learning</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="intent"
                    value="VERIFICATION"
                    checked={userIntent === "VERIFICATION"}
                    onChange={() => setUserIntent("VERIFICATION")}
                    disabled={isLoading}
                  />
                  <span>Verification</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-5 text-sm text-zinc-300">
                <span>Fast variant mode:</span>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="proof-mode"
                    value="MATH_FORMAL"
                    checked={modePreference === "MATH_FORMAL"}
                    onChange={() => setModePreference("MATH_FORMAL")}
                    disabled={isLoading}
                  />
                  <span>Math formal</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="proof-mode"
                    value="EXPLANATORY"
                    checked={modePreference === "EXPLANATORY"}
                    onChange={() => setModePreference("EXPLANATORY")}
                    disabled={isLoading}
                  />
                  <span>Explanatory</span>
                </label>
              </div>

              {scopeReview ? (
                <div className="rounded border border-border bg-background p-3 text-sm">
                  <p className="text-zinc-200">{scopeReview.message}</p>
                  <p className="mt-1 text-zinc-400">Reason: {scopeReview.reason}</p>
                  <p className="mt-1 text-zinc-400">Suggestion: {scopeReview.suggestion}</p>
                  <button
                    className="mt-3 rounded border border-border px-3 py-1.5 text-xs text-zinc-200 hover:text-white"
                    type="button"
                    onClick={() => void startGeneration(true)}
                    disabled={isLoading}
                  >
                    Proceed anyway
                  </button>
                </div>
              ) : null}

              {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}

              <button className="primary" type="submit" disabled={isLoading || !problem.trim()}>
                {isLoading ? "Generating..." : "Generate Structured Proof"}
              </button>
            </form>
          </article>

          <article className="surface p-5 sm:p-6">
            <h2 className="section-title mb-4">Streaming Thinking</h2>
            <pre
              className="terminal"
              aria-live="polite"
              ref={terminalRef}
              onScroll={(scrollEvent) => {
                const target = scrollEvent.currentTarget;
                const nearBottom =
                  target.scrollHeight - target.scrollTop - target.clientHeight < 18;
                setAutoScroll(nearBottom);
              }}
            >
              {logs.join("\n")}
            </pre>
          </article>
        </section>

        <section className="grid gap-6">
          <article className="surface space-y-4 p-5 sm:p-6">
            <h2 className="section-title">The Plan</h2>
            {streamState.plan ? (
              <>
                <p className="font-mono text-sm text-zinc-300">Strategy: {streamState.plan.meta.strategy}</p>
                <p className="text-sm text-zinc-200">Goal: {streamState.plan.setup.goal}</p>
                <p className="text-sm text-zinc-300">
                  Assumptions:{" "}
                  {streamState.plan.setup.assumptions.length > 0
                    ? streamState.plan.setup.assumptions.join("; ")
                    : "None provided."}
                </p>
                <details className="plan-json-box rounded-lg border border-border p-3">
                  <summary className="cursor-pointer font-mono text-xs text-zinc-400">
                    View full plan JSON
                  </summary>
                  <pre className="mt-3 overflow-x-auto font-mono text-xs text-zinc-300">
                    {JSON.stringify(streamState.plan, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="text-zinc-300">Strategy and assumptions will appear here.</p>
            )}
          </article>

          <article className="surface space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-title">The Proof</h2>
              <div className="flex gap-2">
                <button
                  className={`rounded border px-3 py-1 text-xs ${
                    activeProofTab === "PRIMARY"
                      ? "border-white text-white"
                      : "border-border text-zinc-400"
                  }`}
                  type="button"
                  onClick={() => setActiveProofTab("PRIMARY")}
                >
                  Fast Math
                </button>
                {showDeepDiveTab ? (
                  <button
                    className={`rounded border px-3 py-1 text-xs ${
                      activeProofTab === "DEEP_DIVE"
                        ? "border-white text-white"
                        : "border-border text-zinc-400"
                    }`}
                    type="button"
                    onClick={() => setActiveProofTab("DEEP_DIVE")}
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

            {deepDiveStatusMessage ? (
              <p className="text-sm text-zinc-400">{deepDiveStatusMessage}</p>
            ) : null}

            {activeProofMarkdown ? (
              <div className="proof-scroll-panel proof-markdown">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {activeProofMarkdown}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-zinc-300">Structured markdown + math output will appear here.</p>
            )}
          </article>

          <article className="surface space-y-4 p-5 sm:p-6">
            <h2 className="section-title">The Audit</h2>
            {finalAudit ? (
              <>
                <p className="font-mono text-sm text-zinc-200">Status: {finalAudit.status}</p>
                <p className="text-sm text-zinc-300">Attempts: {finalAudit.attempts}</p>
                <p className="text-sm text-zinc-200">{finalAudit.final_verdict}</p>
                {finalAudit.critiques.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-300">
                    {finalAudit.critiques.map((critique) => (
                      <li key={critique}>{critique}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-300">No remaining gaps.</p>
                )}
              </>
            ) : (
              <p className="text-zinc-300">Critic feedback and verdict will appear here.</p>
            )}
          </article>

          <article className="surface space-y-3 p-5 sm:p-6">
            <h2 className="section-title">Mental Model</h2>
            {streamState.fastPayload ? (
              <>
                <h3 className="font-mono text-lg text-white">{streamState.fastPayload.mentalModel.title}</h3>
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                  {streamState.fastPayload.mode} · {streamState.fastPayload.variantRole}
                </p>
                <p className="text-sm text-zinc-300">The trick: {streamState.fastPayload.mentalModel.trick}</p>
                <p className="text-sm text-zinc-300">The logic: {streamState.fastPayload.mentalModel.logic}</p>
                <p className="text-sm text-zinc-300">
                  Key invariant: {streamState.fastPayload.mentalModel.invariant}
                </p>
              </>
            ) : (
              <p className="text-zinc-300">Mental model flashcard appears after generation.</p>
            )}
          </article>

          <FollowupBox context={followupContext} />
        </section>

        {!hasOutput && !isLoading ? (
          <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            Ready for your first proof request.
          </p>
        ) : null}

        <SiteFooter />
      </main>

      {isProofFullscreen ? (
        <div className="proof-fullscreen-overlay">
          <div className="proof-fullscreen-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-400">
                Proof View
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
            {activeProofMarkdown ? (
              <div className="proof-fullscreen-scroll proof-markdown">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {activeProofMarkdown}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No proof content yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

