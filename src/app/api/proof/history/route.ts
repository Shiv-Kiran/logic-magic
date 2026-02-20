import { listProofHistoryByUser } from "@/lib/proofs/repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(): Promise<Response> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const rows = await listProofHistoryByUser({
    supabase,
    userId,
  });

  const grouped = new Map<
    string,
    {
      runId: string;
      createdAt: string;
      problem: string;
      fastVariant: {
        proofMarkdown: string;
        auditStatus: string;
        strategy: string;
      } | null;
      explainVariant: {
        proofMarkdown: string;
        auditStatus: string;
        strategy: string;
      } | null;
      statusSummary: string;
    }
  >();

  for (const row of rows) {
    const runId = row.run_id ?? row.id;
    const existing = grouped.get(runId) ?? {
      runId,
      createdAt: row.created_at,
      problem: row.problem,
      fastVariant: null,
      explainVariant: null,
      statusSummary: "PENDING",
    };

    if (row.variant_role === "FAST_PRIMARY") {
      existing.fastVariant = {
        proofMarkdown: row.proof_markdown,
        auditStatus: row.audit_status,
        strategy: row.strategy,
      };
    }

    if (row.variant_role === "BACKGROUND_QUALITY") {
      existing.explainVariant = {
        proofMarkdown: row.proof_markdown,
        auditStatus: row.audit_status,
        strategy: row.strategy,
      };
    }

    if (existing.fastVariant && existing.explainVariant) {
      existing.statusSummary = "COMPLETE";
    } else if (existing.fastVariant) {
      existing.statusSummary = "FAST_READY";
    }

    if (row.created_at > existing.createdAt) {
      existing.createdAt = row.created_at;
    }

    grouped.set(runId, existing);
  }

  return Response.json({
    runs: Array.from(grouped.values()).sort((a, b) =>
      a.createdAt > b.createdAt ? -1 : 1,
    ),
  });
}

