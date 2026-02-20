import {
  createModelRunners,
  followupRequestSchema,
  resolveOpenAiModelConfig,
  toModelRunnerConfig,
} from "@/lib/logic";
import { listProofVariantsByRunId } from "@/lib/proofs/repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown follow-up error";
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = followupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request payload.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  let runnerConfig: ReturnType<typeof toModelRunnerConfig>;
  try {
    runnerConfig = toModelRunnerConfig(apiKey, resolveOpenAiModelConfig());
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }

  let context:
    | {
        problem: string;
        strategy: string;
        variantRole: "FAST_PRIMARY" | "BACKGROUND_QUALITY";
        proofMarkdown: string;
      }
    | undefined;
  let modeHint = parsed.data.modeHint;

  if (parsed.data.runId) {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return Response.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const rows = await listProofVariantsByRunId({
      supabase,
      runId: parsed.data.runId,
    });

    if (rows.length === 0) {
      return Response.json({ error: "Run not found." }, { status: 404 });
    }

    const ownedRows = rows.filter((row) => row.user_id === userId);
    if (ownedRows.length === 0) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }

    const preferredVariant = parsed.data.variantRole ?? "FAST_PRIMARY";
    const selected =
      ownedRows.find((row) => row.variant_role === preferredVariant) ?? ownedRows[0];

    if (!selected) {
      return Response.json({ error: "Variant not found for run." }, { status: 404 });
    }

    context = {
      problem: selected.problem,
      strategy: selected.strategy,
      variantRole: selected.variant_role,
      proofMarkdown: selected.proof_markdown,
    };

    modeHint = modeHint ?? selected.proof_mode;
  }

  try {
    const runners = createModelRunners(runnerConfig);

    const result = await runners.runFollowup({
      question: parsed.data.question,
      modeHint,
      context,
    });

    if (!result.markdown.trim()) {
      return Response.json({ error: "Follow-up returned empty output." }, { status: 502 });
    }

    return Response.json({
      answerMarkdown: result.markdown,
      model: result.modelId,
      usedContext: result.usedContext,
    });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
