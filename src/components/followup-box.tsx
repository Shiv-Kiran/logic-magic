"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { ProofMode, VariantRole } from "@/lib/logic/types";

type FollowupContext = {
  runId?: string;
  variantRole?: VariantRole;
  modeHint?: ProofMode;
};

type FollowupApiResponse = {
  answerMarkdown: string;
  model: string;
  usedContext: "NONE" | "RUN_VARIANT";
  freeRemaining?: number | null;
};

type FollowupBoxProps = {
  context?: FollowupContext;
  title?: string;
  placeholder?: string;
  defaultUseContext?: boolean;
};

export function FollowupBox({
  context,
  title = "Follow-up",
  placeholder = "Ask a focused follow-up question...",
  defaultUseContext = false,
}: FollowupBoxProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useContext, setUseContext] = useState(defaultUseContext && Boolean(context?.runId));
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    if (!context?.runId) {
      setUseContext(false);
      return;
    }

    setUseContext(defaultUseContext);
  }, [context?.runId, defaultUseContext]);

  const payloadContext = useMemo(() => {
    if (!context?.runId || !useContext) {
      return {
        modeHint: context?.modeHint,
      };
    }

    return {
      runId: context.runId,
      variantRole: context.variantRole,
      modeHint: context.modeHint,
    };
  }, [context, useContext]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError("Follow-up question is required.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proof/followup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          ...payloadContext,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              code?: string;
              loginRequired?: boolean;
            }
          | null;

        if (payload?.loginRequired || payload?.code === "FOLLOWUP_LOGIN_REQUIRED") {
          setShowLoginPrompt(true);
          setError(null);
          setIsLoading(false);
          return;
        }

        throw new Error(payload?.error ?? "Failed to fetch follow-up answer.");
      }

      const payload = (await response.json()) as FollowupApiResponse;

      setAnswer(payload.answerMarkdown);
      setMeta(`Model: ${payload.model} | Context: ${payload.usedContext}`);
      setShowLoginPrompt(false);
      setQuestion("");
    } catch (followupError) {
      setError(followupError instanceof Error ? followupError.message : "Unknown follow-up error.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <article className="surface space-y-4 p-5 sm:p-6">
      <h2 className="section-title">{title}</h2>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          maxLength={1200}
          className="min-h-[96px]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {context?.runId ? (
            <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={useContext}
                onChange={(event) => setUseContext(event.target.checked)}
                disabled={isLoading}
              />
              <span>Use current run context</span>
            </label>
          ) : (
            <span />
          )}

          <button className="primary px-5 py-2 text-sm" type="submit" disabled={isLoading || !question.trim()}>
            {isLoading ? "Asking..." : "Ask"}
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      {meta ? <p className="font-mono text-xs text-zinc-500">{meta}</p> : null}

      <div className={`followup-response proof-markdown ${showLoginPrompt ? "followup-response--locked" : ""}`}>
        {answer ? (
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {answer}
          </ReactMarkdown>
        ) : null}

        {showLoginPrompt ? (
          <div className="followup-lock-overlay">
            <p className="text-sm text-zinc-700">Sign in to continue follow-up questions.</p>
            <Link className="rounded border border-border px-3 py-1.5 text-xs text-zinc-700 hover:text-black" href="/login">
              Sign in
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}
