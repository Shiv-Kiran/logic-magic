import { NextRequest } from "next/server";
import { resolveOpenAiModelConfig, toModelRunnerConfig } from "@/lib/logic";
import { processQueuedProofJobs } from "@/lib/proofs/worker";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_BATCH_SIZE = 5;

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

  let runnerConfig: ReturnType<typeof toModelRunnerConfig>;
  try {
    runnerConfig = toModelRunnerConfig(apiKey, resolveOpenAiModelConfig());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model configuration error.";
    return Response.json({ error: message }, { status: 500 });
  }

  const batchSize = parseBatchSize(new URL(request.url).searchParams.get("batch"));

  const result = await processQueuedProofJobs({
    supabase,
    modelConfig: runnerConfig,
    batchSize,
  });

  return Response.json(result);
}
