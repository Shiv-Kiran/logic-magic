import { SupabaseClient } from "@supabase/supabase-js";
import {
  ModelRunnerConfig,
  createModelRunners,
  proofModeSchema,
  runVariantPipeline,
  userIntentSchema,
} from "@/lib/logic";
import {
  ProofJobRow,
  completeJob,
  failOrRequeueJob,
  fetchPendingProofJobs,
  getProofJobById,
  markJobProcessing,
  persistProofVariant,
} from "@/lib/proofs/repository";

type WorkerDeps = {
  supabase: SupabaseClient;
  modelRunners: ReturnType<typeof createModelRunners>;
  modelFast: string;
  modelQuality: string;
  modelFallback: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown background processing error";
}

async function processClaimedJob(
  job: ProofJobRow,
  deps: WorkerDeps,
): Promise<{ success: boolean; requeued: boolean }> {
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
      runners: deps.modelRunners,
      existingPlan: payload.plan,
    });

    await persistProofVariant({
      supabase: deps.supabase,
      input: {
        problem: payload.problem,
        attempt: payload.attempt,
        userIntent: intentResult.data,
      },
      payload: variant.payload,
      userId: payload.userId ?? job.user_id,
      modelsUsed: variant.modelsUsed,
      modelFast: deps.modelFast,
      modelQuality: deps.modelQuality,
      modelFallback: deps.modelFallback,
      latencyMs: variant.latencyMs,
    });

    await completeJob({
      supabase: deps.supabase,
      jobId: job.id,
    });

    return {
      success: true,
      requeued: false,
    };
  } catch (error) {
    const before = job.attempt_count;

    await failOrRequeueJob({
      supabase: deps.supabase,
      job,
      errorMessage: toErrorMessage(error),
    });

    return {
      success: false,
      requeued: before + 1 < job.max_attempts,
    };
  }
}

export async function processQueuedProofJobs(args: {
  supabase: SupabaseClient;
  modelConfig: ModelRunnerConfig;
  batchSize: number;
}): Promise<{
  processed: number;
  completed: number;
  failed: number;
  queuedSeen: number;
}> {
  const modelFast = args.modelConfig.modelFast ?? "gpt-4.1";
  const modelQuality = args.modelConfig.modelQuality ?? "gpt-5";
  const modelFallback = args.modelConfig.modelFallback ?? "gpt-4.1";

  const modelRunners = createModelRunners(args.modelConfig);
  const jobs = await fetchPendingProofJobs({
    supabase: args.supabase,
    batchSize: args.batchSize,
  });

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const claimed = await markJobProcessing({
      supabase: args.supabase,
      jobId: job.id,
    });

    if (!claimed) {
      continue;
    }

    processed += 1;

    const result = await processClaimedJob(job, {
      supabase: args.supabase,
      modelRunners,
      modelFast,
      modelQuality,
      modelFallback,
    });

    if (result.success) {
      completed += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed,
    completed,
    failed,
    queuedSeen: jobs.length,
  };
}

export async function processSpecificProofJob(args: {
  supabase: SupabaseClient;
  modelConfig: ModelRunnerConfig;
  jobId: string;
}): Promise<void> {
  const job = await getProofJobById({
    supabase: args.supabase,
    jobId: args.jobId,
  });

  if (!job || job.status !== "QUEUED") {
    return;
  }

  const claimed = await markJobProcessing({
    supabase: args.supabase,
    jobId: job.id,
  });

  if (!claimed) {
    return;
  }

  const modelFast = args.modelConfig.modelFast ?? "gpt-4.1";
  const modelQuality = args.modelConfig.modelQuality ?? "gpt-5";
  const modelFallback = args.modelConfig.modelFallback ?? "gpt-4.1";

  const modelRunners = createModelRunners(args.modelConfig);

  await processClaimedJob(job, {
    supabase: args.supabase,
    modelRunners,
    modelFast,
    modelQuality,
    modelFallback,
  });
}
