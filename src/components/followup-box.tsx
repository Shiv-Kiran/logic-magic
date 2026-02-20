"use client";

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
  placeholder = "Ask a concise follow-up question about this proof...",
  defaultUseContext = false,
}: FollowupBoxProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useContext, setUseContext] = useState(defaultUseContext && Boolean(context?.runId));

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
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to fetch follow-up answer.");
      }

      const payload = (await response.json()) as FollowupApiResponse;

      setAnswer(payload.answerMarkdown);
      setMeta(`Model: ${payload.model} · Context: ${payload.usedContext}`);
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
        {context?.runId ? (
          <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={useContext}
              onChange={(event) => setUseContext(event.target.checked)}
              disabled={isLoading}
            />
            Use current run context
          </label>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button className="primary" type="submit" disabled={isLoading || !question.trim()}>
          {isLoading ? "Asking..." : "Ask"}
        </button>
      </form>

      {meta ? <p className="font-mono text-xs text-zinc-500">{meta}</p> : null}

      {answer ? (
        <div className="proof-markdown">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {answer}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">
          Concise math-first follow-up answers will appear here.
        </p>
      )}
    </article>
  );
}
