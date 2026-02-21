import { NextRequest } from "next/server";
import { getMentalModel } from "@/lib/logic/mental-model";
import {
  auditReportSchema,
  planJsonSchema,
  ProofStrategy,
  proofModeSchema,
  resolveOpenAiModelConfig,
  toModelRunnerConfig,
} from "@/lib/logic";
import {
  getBackgroundVariantProof,
  getProofJobById,
} from "@/lib/proofs/repository";
import { processSpecificProofJob } from "@/lib/proofs/worker";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ jobId: string }>;
};

const OPPORTUNISTIC_KICK_KEY = "__magiclogic_opportunistic_job_kick__";
const DEFAULT_KICK_DELAY_SECONDS = 6;
const DEFAULT_RETRIGGER_SECONDS = 15;

function readPositiveIntEnv(raw: string | undefined, fallback: number, max = 300): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function getKickStore(): Map<string, number> {
  const globalScope = globalThis as typeof globalThis & {
    [OPPORTUNISTIC_KICK_KEY]?: Map<string, number>;
  };

  if (!globalScope[OPPORTUNISTIC_KICK_KEY]) {
    globalScope[OPPORTUNISTIC_KICK_KEY] = new Map<string, number>();
  }

  return globalScope[OPPORTUNISTIC_KICK_KEY]!;
}

function maybeKickQueuedJob(args: {
  jobId: string;
  queuedSinceMs: number;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
}): void {
  const kickDelaySeconds = readPositiveIntEnv(
    process.env.OPPORTUNISTIC_JOB_KICK_DELAY_SECONDS,
    DEFAULT_KICK_DELAY_SECONDS,
  );
  const retriggerSeconds = readPositiveIntEnv(
    process.env.OPPORTUNISTIC_JOB_RETRIGGER_SECONDS,
    DEFAULT_RETRIGGER_SECONDS,
  );

  if (args.queuedSinceMs < kickDelaySeconds * 1000) {
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return;
  }

  const now = Date.now();
  const store = getKickStore();
  const lastTriggeredAt = store.get(args.jobId) ?? 0;
  if (now - lastTriggeredAt < retriggerSeconds * 1000) {
    return;
  }

  store.set(args.jobId, now);

  try {
    const modelConfig = resolveOpenAiModelConfig();
    const runnerConfig = toModelRunnerConfig(apiKey, modelConfig);

    void processSpecificProofJob({
      supabase: args.supabase,
      modelConfig: runnerConfig,
      jobId: args.jobId,
    }).catch(() => undefined);
  } catch {
    // Ignore opportunistic execution failures and rely on regular polling.
  }
}

export async function GET(_request: NextRequest, context: Params): Promise<Response> {
  const { jobId } = await context.params;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const job = await getProofJobById({
    supabase,
    jobId,
  });

  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  const userId = await getAuthenticatedUserId();
  if (job.user_id && userId !== job.user_id) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const modeResult = proofModeSchema.safeParse(job.payload_json.mode ?? "EXPLANATORY");
  const mode = modeResult.success ? modeResult.data : "EXPLANATORY";

  if (job.status === "QUEUED") {
    const queuedAtMs = Date.parse(job.scheduled_at || job.created_at);
    if (!Number.isNaN(queuedAtMs)) {
      maybeKickQueuedJob({
        jobId: job.id,
        queuedSinceMs: Date.now() - queuedAtMs,
        supabase,
      });
    }
  }

  if (job.status !== "COMPLETED") {
    return Response.json({
      jobId: job.id,
      status: job.status,
      mode,
      error: job.last_error,
    });
  }

  const row = await getBackgroundVariantProof({
    supabase,
    runId: job.run_id,
  });

  if (!row) {
    return Response.json({
      jobId: job.id,
      status: job.status,
      mode,
      error: "Job completed but proof variant record not found.",
    });
  }

  const planResult = planJsonSchema.safeParse(row.plan_json);
  const auditResult = auditReportSchema.safeParse(row.audit_report);

  if (!planResult.success || !auditResult.success) {
    return Response.json({
      jobId: job.id,
      status: "FAILED",
      mode,
      error: "Stored proof data is invalid.",
    });
  }

  const strategy =
    planResult.data.meta.strategy ??
    (Object.values(ProofStrategy).includes(row.strategy as ProofStrategy)
      ? (row.strategy as ProofStrategy)
      : ProofStrategy.DIRECT_PROOF);

  return Response.json({
    jobId: job.id,
    status: job.status,
    mode,
    proof: {
      runId: row.run_id ?? job.run_id,
      strategy,
      attempts: row.attempt_count,
      mode,
      variantRole: "BACKGROUND_QUALITY",
      isBackground: true,
      plan: planResult.data,
      proofMarkdown: row.proof_markdown,
      audit: auditResult.data,
      mentalModel: getMentalModel(strategy),
    },
  });
}
