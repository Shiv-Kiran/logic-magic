import { NextRequest } from "next/server";
import {
  createModelRunners,
  proofModeSchema,
  runVariantPipeline,
  userIntentSchema,
} from "@/lib/logic";
import {
  completeJob,
  failOrRequeueJob,
  fetchPendingProofJobs,
  markJobProcessing,
  persistProofVariant,
} from "@/lib/proofs/repository";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_MODEL_FAST = "gpt-4.1";
const DEFAULT_MODEL_QUALITY = "gpt-5";
const DEFAULT_MODEL_FALLBACK = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_BATCH_SIZE = 5;

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

function parseBatchSize(value: string | null): number {
  if (!value) {
    return DEFAULT_BATCH_SIZE;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(parsed, 25);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown background processing error";
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.INTERNAL_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "INTERNAL_CRON_SECRET is not configured." }, { status: 500 });
  }

  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const modelFast = process.env.OPENAI_MODEL_FAST ?? DEFAULT_MODEL_FAST;
  const modelQuality = process.env.OPENAI_MODEL_QUALITY ?? DEFAULT_MODEL_QUALITY;
  const modelFallback = process.env.OPENAI_MODEL_FALLBACK ?? DEFAULT_MODEL_FALLBACK;
  const timeoutMs = resolveTimeoutMs(process.env.OPENAI_TIMEOUT_MS);

  const runners = createModelRunners({
    apiKey,
    modelFast,
    modelQuality,
    modelFallback,
    timeoutMs,
  });

  const batchSize = parseBatchSize(new URL(request.url).searchParams.get("batch"));
  const jobs = await fetchPendingProofJobs({
    supabase,
    batchSize,
  });

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const claimed = await markJobProcessing({
      supabase,
      jobId: job.id,
    });

    if (!claimed) {
      continue;
    }

    processed += 1;

    try {
      const payload = job.payload_json;

      const modeResult = proofModeSchema.safeParse(payload.mode ?? "EXPLANATORY");
      const intentResult = userIntentSchema.safeParse(payload.userIntent);

      if (!modeResult.success || !intentResult.success) {
        throw new Error("Invalid background job payload.");
      }

      const variant = await runVariantPipeline({
        runId: payload.runId,
        input: {
          problem: payload.problem,
          attempt: payload.attempt,
          userIntent: intentResult.data,
          modePreference: modeResult.data,
        },
        mode: modeResult.data,
        variantRole: "BACKGROUND_QUALITY",
        isBackground: true,
        modelTier: "QUALITY",
        maxAttempts: 2,
        runners,
        existingPlan: payload.plan,
      });

      await persistProofVariant({
        supabase,
        input: {
          problem: payload.problem,
          attempt: payload.attempt,
          userIntent: intentResult.data,
        },
        payload: variant.payload,
        userId: payload.userId ?? job.user_id,
        modelsUsed: variant.modelsUsed,
        modelFast,
        modelQuality,
        modelFallback,
        latencyMs: variant.latencyMs,
      });

      await completeJob({
        supabase,
        jobId: job.id,
      });

      completed += 1;
    } catch (error) {
      await failOrRequeueJob({
        supabase,
        job,
        errorMessage: toErrorMessage(error),
      });
      failed += 1;
    }
  }

  return Response.json({
    processed,
    completed,
    failed,
    queuedSeen: jobs.length,
  });
}

