import { NextRequest } from "next/server";
import { runProofPipeline } from "@/lib/logic/orchestrator";
import { createModelRunners } from "@/lib/logic/llm";
import { generateProofRequestSchema } from "@/lib/logic/schema";
import { StreamEvent } from "@/lib/logic/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_MODEL_PRIMARY = "gpt-5";
const DEFAULT_MODEL_FALLBACK = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 30_000;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function resolveTimeoutMs(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return parsed;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      {
        status: 400,
      },
    );
  }

  const parsedRequest = generateProofRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json(
      {
        error: "Invalid request payload.",
        issues: parsedRequest.error.issues,
      },
      {
        status: 400,
      },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "OPENAI_API_KEY is not configured.",
      },
      {
        status: 500,
      },
    );
  }

  const modelPrimary = process.env.OPENAI_MODEL_PRIMARY ?? DEFAULT_MODEL_PRIMARY;
  const modelFallback = process.env.OPENAI_MODEL_FALLBACK ?? DEFAULT_MODEL_FALLBACK;
  const timeoutMs = resolveTimeoutMs(process.env.OPENAI_TIMEOUT_MS);

  const runners = createModelRunners({
    apiKey,
    modelPrimary,
    modelFallback,
    timeoutMs,
  });

  const supabase = getSupabaseAdminClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: StreamEvent): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await runProofPipeline(
          parsedRequest.data,
          {
            ...runners,
            persistProof: async (record) => {
              if (!supabase) {
                throw new Error("Supabase client is not configured.");
              }

              const { error } = await supabase.from("proofs").insert({
                problem: record.input.problem,
                attempt: record.input.attempt ?? null,
                user_intent: record.input.userIntent,
                strategy: record.payload.strategy,
                confidence_score: record.payload.plan.meta.confidence_score,
                plan_json: record.payload.plan,
                proof_markdown: record.payload.proofMarkdown,
                audit_status: record.payload.audit.status,
                audit_report: record.payload.audit,
                attempt_count: record.payload.attempts,
                model_primary: record.modelPrimary,
                model_fallback: record.modelFallback ?? null,
                models_used: record.modelsUsed,
                latency_ms: record.latencyMs,
              });

              if (error) {
                throw new Error(error.message);
              }
            },
          },
          sendEvent,
          modelPrimary,
          modelFallback,
        );
      } catch (error) {
        sendEvent({
          type: "error",
          code: "PIPELINE_ERROR",
          message: toErrorMessage(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
