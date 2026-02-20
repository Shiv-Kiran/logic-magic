import { NextRequest } from "next/server";
import { getMentalModel } from "@/lib/logic/mental-model";
import {
  auditReportSchema,
  planJsonSchema,
  proofModeSchema,
  ProofStrategy,
} from "@/lib/logic";
import {
  getBackgroundVariantProof,
  getProofJobById,
} from "@/lib/proofs/repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ jobId: string }>;
};

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

