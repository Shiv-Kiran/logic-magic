import { SupabaseClient } from "@supabase/supabase-js";
import {
  BackgroundJobPayload,
  FinalProofPayload,
  JobStatus,
  ProofMode,
  VariantRole,
} from "@/lib/logic/types";

export type PersistProofVariantArgs = {
  supabase: SupabaseClient;
  input: {
    problem: string;
    attempt?: string;
    userIntent: "LEARNING" | "VERIFICATION";
  };
  payload: FinalProofPayload;
  userId?: string | null;
  modelsUsed: string[];
  modelFast: string;
  modelQuality: string;
  modelFallback?: string;
  latencyMs: number;
};

export async function persistProofVariant(args: PersistProofVariantArgs): Promise<void> {
  const { error } = await args.supabase.from("proofs").insert({
    user_id: args.userId ?? null,
    run_id: args.payload.runId,
    problem: args.input.problem,
    attempt: args.input.attempt ?? null,
    user_intent: args.input.userIntent,
    strategy: args.payload.strategy,
    confidence_score: args.payload.plan.meta.confidence_score,
    plan_json: args.payload.plan,
    proof_markdown: args.payload.proofMarkdown,
    audit_status: args.payload.audit.status,
    audit_report: args.payload.audit,
    attempt_count: args.payload.attempts,
    model_primary: args.payload.isBackground ? args.modelQuality : args.modelFast,
    model_fallback: args.modelFallback ?? null,
    models_used: args.modelsUsed,
    latency_ms: args.latencyMs,
    proof_mode: args.payload.mode,
    variant_role: args.payload.variantRole,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function enqueueBackgroundJob(args: {
  supabase: SupabaseClient;
  runId: string;
  userId?: string | null;
  payload: BackgroundJobPayload;
  mode?: ProofMode;
}): Promise<{ id: string }> {
  const { data, error } = await args.supabase
    .from("proof_jobs")
    .insert({
      run_id: args.runId,
      user_id: args.userId ?? null,
      job_type: "EXPLAIN_VARIANT",
      payload_json: {
        ...args.payload,
        mode: args.mode ?? "EXPLANATORY",
      },
      status: "QUEUED",
      attempt_count: 0,
      max_attempts: 3,
      scheduled_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to enqueue proof background job.");
  }

  return data;
}

export type ProofJobRow = {
  id: string;
  run_id: string;
  user_id: string | null;
  job_type: string;
  payload_json: BackgroundJobPayload & { mode?: ProofMode };
  status: JobStatus;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function getProofJobById(args: {
  supabase: SupabaseClient;
  jobId: string;
}): Promise<ProofJobRow | null> {
  const { data, error } = await args.supabase
    .from("proof_jobs")
    .select("*")
    .eq("id", args.jobId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ProofJobRow | null;
}

export async function fetchPendingProofJobs(args: {
  supabase: SupabaseClient;
  batchSize: number;
}): Promise<ProofJobRow[]> {
  const { data, error } = await args.supabase
    .from("proof_jobs")
    .select("*")
    .eq("status", "QUEUED")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(args.batchSize);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProofJobRow[];
}

export async function markJobProcessing(args: {
  supabase: SupabaseClient;
  jobId: string;
}): Promise<boolean> {
  const { data, error } = await args.supabase
    .from("proof_jobs")
    .update({
      status: "PROCESSING",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobId)
    .eq("status", "QUEUED")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

export async function completeJob(args: {
  supabase: SupabaseClient;
  jobId: string;
}): Promise<void> {
  const { error } = await args.supabase
    .from("proof_jobs")
    .update({
      status: "COMPLETED",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", args.jobId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function failOrRequeueJob(args: {
  supabase: SupabaseClient;
  job: ProofJobRow;
  errorMessage: string;
}): Promise<void> {
  const nextAttemptCount = args.job.attempt_count + 1;
  const shouldFail = nextAttemptCount >= args.job.max_attempts;

  const scheduledAt = new Date(Date.now() + 20_000).toISOString();

  const { error } = await args.supabase
    .from("proof_jobs")
    .update({
      status: shouldFail ? "FAILED" : "QUEUED",
      attempt_count: nextAttemptCount,
      scheduled_at: shouldFail ? args.job.scheduled_at : scheduledAt,
      last_error: args.errorMessage,
      finished_at: shouldFail ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.job.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getBackgroundVariantProof(args: {
  supabase: SupabaseClient;
  runId: string;
}): Promise<
  | {
      run_id: string | null;
      proof_markdown: string;
      plan_json: unknown;
      audit_report: unknown;
      strategy: string;
      attempt_count: number;
      proof_mode: ProofMode;
      variant_role: VariantRole;
    }
  | null
> {
  const { data, error } = await args.supabase
    .from("proofs")
    .select(
      "run_id,proof_markdown,plan_json,audit_report,strategy,attempt_count,proof_mode,variant_role",
    )
    .eq("run_id", args.runId)
    .eq("variant_role", "BACKGROUND_QUALITY")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listProofHistoryByUser(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  Array<{
    id: string;
    run_id: string | null;
    created_at: string;
    problem: string;
    proof_markdown: string;
    audit_status: string;
    proof_mode: ProofMode;
    variant_role: VariantRole;
    strategy: string;
  }>
> {
  const { data, error } = await args.supabase
    .from("proofs")
    .select(
      "id,run_id,created_at,problem,proof_markdown,audit_status,proof_mode,variant_role,strategy",
    )
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export type ProofRunVariantRow = {
  id: string;
  run_id: string | null;
  user_id: string | null;
  created_at: string;
  problem: string;
  strategy: string;
  proof_markdown: string;
  plan_json: unknown;
  audit_report: unknown;
  audit_status: string;
  attempt_count: number;
  proof_mode: ProofMode;
  variant_role: VariantRole;
};

export async function listProofVariantsByRunId(args: {
  supabase: SupabaseClient;
  runId: string;
}): Promise<ProofRunVariantRow[]> {
  const { data, error } = await args.supabase
    .from("proofs")
    .select(
      "id,run_id,user_id,created_at,problem,strategy,proof_markdown,plan_json,audit_report,audit_status,attempt_count,proof_mode,variant_role",
    )
    .eq("run_id", args.runId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProofRunVariantRow[];
}

