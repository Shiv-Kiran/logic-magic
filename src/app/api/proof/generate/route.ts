import { after, NextRequest } from "next/server";
import {
  assessMathScope,
  StreamEvent,
  createModelRunners,
  generateProofRequestSchema,
  resolveOpenAiModelConfig,
  runVariantPipeline,
  toModelRunnerConfig,
} from "@/lib/logic";
import { enqueueBackgroundJob, persistProofVariant } from "@/lib/proofs/repository";
import { processSpecificProofJob } from "@/lib/proofs/worker";
import { checkFixedWindowRateLimit, extractClientIp } from "@/lib/security/rate-limit";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function readPositiveIntEnv(raw: string | undefined, fallback: number, max = 10_000): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
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

  let modelConfig: ReturnType<typeof resolveOpenAiModelConfig>;
  let runnerConfig: ReturnType<typeof toModelRunnerConfig>;
  try {
    modelConfig = resolveOpenAiModelConfig();
    runnerConfig = toModelRunnerConfig(apiKey, modelConfig);
  } catch (error) {
    return Response.json(
      {
        error: toErrorMessage(error),
      },
      {
        status: 500,
      },
    );
  }

  const supabase = getSupabaseAdminClient();
  const userId = await getAuthenticatedUserId();
  const clientIp = extractClientIp(request);
  const runners = createModelRunners(runnerConfig);

  if (!userId) {
    const anonLimit = readPositiveIntEnv(process.env.GENERATE_ANON_LIMIT, 6, 100);
    const anonWindowMinutes = readPositiveIntEnv(process.env.GENERATE_ANON_WINDOW_MINUTES, 60, 24 * 60);
    const anonCheck = checkFixedWindowRateLimit({
      namespace: "generate-anon",
      identifier: `ip:${clientIp}`,
      limit: anonLimit,
      windowMs: anonWindowMinutes * 60_000,
    });

    if (!anonCheck.allowed) {
      return Response.json(
        {
          error: "Guest generation limit reached. Please sign in to continue.",
          code: "GENERATE_LOGIN_REQUIRED",
          loginRequired: true,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(anonCheck.retryAfterSeconds),
          },
        },
      );
    }
  }

  const scopeResult = await assessMathScope({
    problem: parsedRequest.data.problem,
    attempt: parsedRequest.data.attempt,
    classifyAmbiguous: async ({ problem, attempt }) => {
      const classified = await runners.runMathScope({
        problem,
        attempt,
      });

      return classified.result;
    },
  });

  if (scopeResult.verdict === "BLOCK") {
    return Response.json(
      {
        code: "MATH_SCOPE_BLOCKED",
        verdict: "BLOCK",
        message: "This request does not appear to be a math-proof prompt.",
        reason: scopeResult.reason,
        suggestion: scopeResult.suggestion,
        canOverride: false,
      },
      {
        status: 422,
      },
    );
  }

  if (scopeResult.verdict === "REVIEW" && !parsedRequest.data.scopeOverride) {
    return Response.json(
      {
        code: "MATH_SCOPE_REVIEW",
        verdict: "REVIEW",
        message: "This prompt may be mathematical, but the intent is ambiguous.",
        reason: scopeResult.reason,
        suggestion: scopeResult.suggestion,
        canOverride: true,
      },
      {
        status: 422,
      },
    );
  }

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
            modelFast: modelConfig.modelFast,
            modelQuality: modelConfig.modelQuality,
            modelFallback: modelConfig.modelFallback,
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

          // Asynchronous job execution without requiring Vercel cron.
          after(async () => {
            await processSpecificProofJob({
              supabase,
              modelConfig: runnerConfig,
              jobId: job.id,
            });
          });
        } else {
          sendEvent({
            type: "status",
            stage: "background",
            message: "Supabase not configured. Deep Dive generation skipped.",
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
