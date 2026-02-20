import { NextRequest } from "next/server";
import {
  createModelRunners,
  followupRequestSchema,
  resolveOpenAiModelConfig,
  toModelRunnerConfig,
} from "@/lib/logic";
import { listProofVariantsByRunId } from "@/lib/proofs/repository";
import { checkFixedWindowRateLimit, extractClientIp } from "@/lib/security/rate-limit";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown follow-up error";
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

  const userId = await getAuthenticatedUserId();
  const clientIp = extractClientIp(request);
  const isAnonymous = !userId;
  const rateLimitId = isAnonymous ? `ip:${clientIp}` : `user:${userId}`;

  const burstLimit = readPositiveIntEnv(
    isAnonymous ? process.env.FOLLOWUP_ANON_BURST_LIMIT : process.env.FOLLOWUP_AUTH_BURST_LIMIT,
    isAnonymous ? 6 : 40,
    500,
  );
  const burstWindowMinutes = readPositiveIntEnv(
    isAnonymous
      ? process.env.FOLLOWUP_ANON_BURST_WINDOW_MINUTES
      : process.env.FOLLOWUP_AUTH_BURST_WINDOW_MINUTES,
    10,
    24 * 60,
  );

  const burstCheck = checkFixedWindowRateLimit({
    namespace: "followup-burst",
    identifier: rateLimitId,
    limit: burstLimit,
    windowMs: burstWindowMinutes * 60_000,
  });

  if (!burstCheck.allowed) {
    return Response.json(
      {
        error: "Too many follow-up requests. Please try again shortly.",
        code: "RATE_LIMITED",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(burstCheck.retryAfterSeconds),
        },
      },
    );
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
  let freeRemaining: number | null = null;

  if (isAnonymous && parsed.data.runId) {
    return Response.json(
      {
        error: "Sign in to use run-bound context for follow-up.",
        code: "AUTH_REQUIRED_FOR_CONTEXT",
        loginRequired: true,
      },
      { status: 401 },
    );
  }

  if (isAnonymous) {
    const freeLimit = readPositiveIntEnv(process.env.FOLLOWUP_FREE_LIMIT, 2, 20);
    const freeWindowMinutes = readPositiveIntEnv(process.env.FOLLOWUP_FREE_WINDOW_MINUTES, 24 * 60, 7 * 24 * 60);
    const freeCheck = checkFixedWindowRateLimit({
      namespace: "followup-free",
      identifier: `ip:${clientIp}`,
      limit: freeLimit,
      windowMs: freeWindowMinutes * 60_000,
    });

    freeRemaining = freeCheck.remaining;

    if (!freeCheck.allowed) {
      return Response.json(
        {
          error: `You have used ${freeLimit} free follow-up questions. Please sign in to continue.`,
          code: "FOLLOWUP_LOGIN_REQUIRED",
          loginRequired: true,
          freeRemaining: 0,
        },
        { status: 401 },
      );
    }
  }

  if (parsed.data.runId) {
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
      freeRemaining,
    });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
