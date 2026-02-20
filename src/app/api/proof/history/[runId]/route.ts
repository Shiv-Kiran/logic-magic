import { NextRequest } from "next/server";
import { auditReportSchema, planJsonSchema, variantRoleSchema } from "@/lib/logic";
import { listProofVariantsByRunId } from "@/lib/proofs/repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ runId: string }>;
};

const variantOrder = {
  FAST_PRIMARY: 0,
  BACKGROUND_QUALITY: 1,
};

export async function GET(_request: NextRequest, context: Params): Promise<Response> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { runId } = await context.params;
  const rows = await listProofVariantsByRunId({
    supabase,
    runId,
  });

  if (rows.length === 0) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  const ownedRows = rows.filter((row) => row.user_id === userId);
  if (ownedRows.length === 0) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const byVariant = new Map<string, (typeof ownedRows)[number]>();
  for (const row of ownedRows) {
    if (!byVariant.has(row.variant_role)) {
      byVariant.set(row.variant_role, row);
    }
  }

  const variants = Array.from(byVariant.values())
    .map((row) => {
      const planResult = planJsonSchema.safeParse(row.plan_json);
      const auditResult = auditReportSchema.safeParse(row.audit_report);
      const roleResult = variantRoleSchema.safeParse(row.variant_role);

      if (!planResult.success || !auditResult.success || !roleResult.success) {
        return null;
      }

      return {
        variantRole: roleResult.data,
        mode: row.proof_mode,
        strategy: row.strategy,
        proofMarkdown: row.proof_markdown,
        planJson: planResult.data,
        audit: auditResult.data,
        attempts: row.attempt_count,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => variantOrder[a.variantRole] - variantOrder[b.variantRole]);

  if (variants.length === 0) {
    return Response.json({ error: "Run variants are invalid." }, { status: 500 });
  }

  const latest = ownedRows[0];

  return Response.json({
    runId,
    createdAt: latest.created_at,
    problem: latest.problem,
    variants,
  });
}
