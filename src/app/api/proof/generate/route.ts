import { NextRequest } from "next/server";
import {
  createModelRunners,
  generateProofRequestSchema,
  runVariantPipeline,
  StreamEvent,
} from "@/lib/logic";
import {
  enqueueBackgroundJob,
  persistProofVariant,
} from "@/lib/proofs/repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_MODEL_FAST = "gpt-4.1";
const DEFAULT_MODEL_QUALITY = "gpt-5";
const DEFAULT_MODEL_FALLBACK = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 20_000;

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

  const modelFast = process.env.OPENAI_MODEL_FAST ?? DEFAULT_MODEL_FAST;
  const modelQuality = process.env.OPENAI_MODEL_QUALITY ?? DEFAULT_MODEL_QUALITY;
  const modelFallback = process.env.OPENAI_MODEL_FALLBACK ?? DEFAULT_MODEL_FALLBACK;
  const timeoutMs = resolveTimeoutMs(process.env.OPENAI_TIMEOUT_MS);

  const supabase = getSupabaseAdminClient();
  const userId = await getAuthenticatedUserId();

  const runId = crypto.randomUUID();
  const fastMode = parsedRequest.data.modePreference;
  const backgroundMode = fastMode === "MATH_FORMAL" ? "EXPLANATORY" : "MATH_FORMAL";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: StreamEvent): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const runners = createModelRunners({
          apiKey,
          modelFast,
          modelQuality,
          modelFallback,
          timeoutMs,
        });

        const fastResult = await runVariantPipeline({
          runId,
          input: parsedRequest.data,
          mode: fastMode,
          variantRole: "FAST_PRIMARY",
          isBackground: false,
          modelTier: "FAST",
          maxAttempts: 1,
          runners,
          onEvent: sendEvent,
        });

        sendEvent({
          type: "final_fast",
          data: fastResult.payload,
        });

        if (supabase) {
          await persistProofVariant({
            supabase,
            input: parsedRequest.data,
            payload: fastResult.payload,
            userId,
            modelsUsed: fastResult.modelsUsed,
            modelFast,
            modelQuality,
            modelFallback,
            latencyMs: fastResult.latencyMs,
          });

          const job = await enqueueBackgroundJob({
            supabase,
            runId,
            userId,
            payload: {
              runId,
              problem: parsedRequest.data.problem,
              attempt: parsedRequest.data.attempt,
              userIntent: parsedRequest.data.userIntent,
              plan: fastResult.payload.plan,
              userId,
            },
            mode: backgroundMode,
          });

          sendEvent({
            type: "background_queued",
            runId,
            jobId: job.id,
            mode: backgroundMode,
          });
        } else {
          sendEvent({
            type: "status",
            stage: "background",
            message: "Supabase not configured. Background queue skipped.",
          });
        }
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

