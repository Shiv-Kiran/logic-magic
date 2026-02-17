"use client";

import { FormEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { FinalProofPayload, StreamEvent, UserIntent } from "@/lib/logic/types";

type StreamState = {
  plan: FinalProofPayload["plan"] | null;
  draft: string;
  finalPayload: FinalProofPayload | null;
};

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
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(["> Ready."]);
  const [streamState, setStreamState] = useState<StreamState>({
    plan: null,
    draft: "",
    finalPayload: null,
  });

  const appendLog = (line: string): void => {
    setLogs((previous) => {
      const next = [...previous, line];
      return next.slice(-120);
    });
  };

  const applyStreamEvent = (event: StreamEvent): void => {
    switch (event.type) {
      case "status": {
        appendLog(formatStatusLine(event.message, event.attempt));
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
      case "draft": {
        appendLog(`> Draft updated for attempt ${event.attempt}.`);
        setStreamState((previous) => ({
          ...previous,
          draft: event.markdown,
        }));
        return;
      }
      case "critique": {
        const summary = event.gaps.length > 0 ? event.gaps.join(" | ") : "No gaps reported.";
        appendLog(`> [Critic ${event.status}] ${summary}`);
        return;
      }
      case "final": {
        appendLog("> Pipeline complete.");
        setStreamState({
          plan: event.data.plan,
          draft: event.data.proofMarkdown,
          finalPayload: event.data,
        });
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!problem.trim()) {
      setErrorMessage("Problem statement is required.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setLogs(["> Initializing Planner..."]);
    setStreamState({
      plan: null,
      draft: "",
      finalPayload: null,
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
        }),
        signal: requestController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to start proof generation.");
      }

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
          } catch {
            appendLog("> [Warn] Ignored malformed stream line.");
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as StreamEvent;
          applyStreamEvent(parsed);
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

  const finalAudit = streamState.finalPayload?.audit;
  const hasOutput = Boolean(streamState.plan || streamState.draft || streamState.finalPayload);

  return (
    <div className="app-grid min-h-screen">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-10 sm:px-8 lg:py-14">
        <header className="space-y-3">
          <p className="section-title">MagicLogic</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Logic IDE for truth</h1>
          <p className="max-w-2xl text-sm text-zinc-400 sm:text-base">
            Convert messy math-English into a formal plan, structured proof, and strict audit.
          </p>
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
                  placeholder="Show that Dijkstra works using contradiction."
                  disabled={isLoading}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Messy attempt (optional)</span>
                <textarea
                  value={attempt}
                  onChange={(inputEvent) => setAttempt(inputEvent.target.value)}
                  placeholder="I think we choose the first wrong vertex and derive a contradiction..."
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

              {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}

              <button className="primary" type="submit" disabled={isLoading || !problem.trim()}>
                {isLoading ? "Generating..." : "Generate Structured Proof"}
              </button>
            </form>
          </article>

          <article className="surface p-5 sm:p-6">
            <h2 className="section-title mb-4">Streaming Thinking</h2>
            <pre className="terminal" aria-live="polite">
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
                  Assumptions: {streamState.plan.setup.assumptions.length > 0 ? streamState.plan.setup.assumptions.join("; ") : "None provided."}
                </p>
                <details className="rounded-lg border border-border bg-black/40 p-3">
                  <summary className="cursor-pointer font-mono text-xs text-zinc-400">View full plan JSON</summary>
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
            <h2 className="section-title">The Proof</h2>
            {streamState.draft ? (
              <div className="proof-markdown">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {streamState.draft}
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
            {streamState.finalPayload ? (
              <>
                <h3 className="font-mono text-lg text-white">{streamState.finalPayload.mentalModel.title}</h3>
                <p className="text-sm text-zinc-300">The trick: {streamState.finalPayload.mentalModel.trick}</p>
                <p className="text-sm text-zinc-300">The logic: {streamState.finalPayload.mentalModel.logic}</p>
                <p className="text-sm text-zinc-300">Key invariant: {streamState.finalPayload.mentalModel.invariant}</p>
              </>
            ) : (
              <p className="text-zinc-300">Mental model flashcard appears after generation.</p>
            )}
          </article>
        </section>

        {!hasOutput && !isLoading ? (
          <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Ready for your first proof request.</p>
        ) : null}
      </main>
    </div>
  );
}
