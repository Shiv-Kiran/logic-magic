import { lintLatexMarkdown } from "@/lib/logic/latex";
import { getMentalModel } from "@/lib/logic/mental-model";
import {
  AuditReport,
  CriticResult,
  FinalProofPayload,
  GenerateProofRequest,
  JobStatus,
  ModelTier,
  PlanJSON,
  ProofMode,
  StreamEvent,
  VariantRole,
} from "@/lib/logic/types";

type OnEvent = (event: StreamEvent) => void;

type ModelRunners = {
  runPlanner: (args: {
    problem: string;
    attempt?: string;
    userIntent: GenerateProofRequest["userIntent"];
    repairMode?: boolean;
    onFallback?: (from: string, to: string) => void;
  }) => Promise<{ plan: PlanJSON; modelId: string }>;
  runWriter: (args: {
    problem: string;
    plan: PlanJSON;
    mode: ProofMode;
    attempt?: string;
    previousDraft?: string;
    criticGaps?: string[];
    modelTier?: ModelTier;
    onDelta?: (delta: string) => void;
    onFallback?: (from: string, to: string) => void;
  }) => Promise<{ markdown: string; modelId: string }>;
  runCritic: (args: {
    plan: PlanJSON;
    draft: string;
    mode: ProofMode;
    modelTier?: ModelTier;
    onFallback?: (from: string, to: string) => void;
  }) => Promise<{ critic: CriticResult; modelId: string }>;
};

export type VariantPipelineResult = {
  payload: FinalProofPayload;
  modelsUsed: string[];
  latencyMs: number;
  runId: string;
};

export type RunVariantPipelineArgs = {
  runId: string;
  input: GenerateProofRequest;
  mode: ProofMode;
  variantRole: VariantRole;
  isBackground: boolean;
  modelTier: ModelTier;
  maxAttempts: number;
  runners: ModelRunners;
  onEvent?: OnEvent;
  existingPlan?: PlanJSON;
};

function emit(onEvent: OnEvent | undefined, event: StreamEvent): void {
  if (!onEvent) {
    return;
  }

  onEvent(event);
}

async function withHeartbeat<T>(
  stage: string,
  onEvent: OnEvent | undefined,
  work: () => Promise<T>,
): Promise<T> {
  if (!onEvent) {
    return work();
  }

  const startedAt = Date.now();
  const intervalId = setInterval(() => {
    const elapsedMs = Date.now() - startedAt;
    emit(onEvent, {
      type: "heartbeat",
      stage,
      elapsed_ms: elapsedMs,
      message: `${stage} is still running...`,
    });
  }, 1200);

  try {
    return await work();
  } finally {
    clearInterval(intervalId);
  }
}

function formatWriterStatus(attempt: number): string {
  if (attempt === 1) {
    return "Drafting...";
  }

  return "Refining Logic...";
}

export async function runVariantPipeline(args: RunVariantPipelineArgs): Promise<VariantPipelineResult> {
  const startedAt = Date.now();
  const modelsUsed = new Set<string>();

  const onEvent = args.onEvent;

  emit(onEvent, {
    type: "status",
    stage: "planner",
    message: "Analyzing Logic Structure...",
  });

  let plan = args.existingPlan;
  if (!plan) {
    try {
      const plannerResult = await withHeartbeat("planner", onEvent, async () => {
        return args.runners.runPlanner({
          problem: args.input.problem,
          attempt: args.input.attempt,
          userIntent: args.input.userIntent,
          onFallback: (from, to) => {
            emit(onEvent, {
              type: "status",
              stage: "planner",
              message: `Planner model fallback: ${from} -> ${to}`,
            });
          },
        });
      });

      modelsUsed.add(plannerResult.modelId);
      plan = plannerResult.plan;
    } catch {
      emit(onEvent, {
        type: "status",
        stage: "planner",
        message: "Planner output invalid. Retrying with strict JSON constraints...",
      });

      const plannerResult = await withHeartbeat("planner-repair", onEvent, async () => {
        return args.runners.runPlanner({
          problem: args.input.problem,
          attempt: args.input.attempt,
          userIntent: args.input.userIntent,
          repairMode: true,
          onFallback: (from, to) => {
            emit(onEvent, {
              type: "status",
              stage: "planner-repair",
              message: `Planner model fallback: ${from} -> ${to}`,
            });
          },
        });
      });

      modelsUsed.add(plannerResult.modelId);
      plan = plannerResult.plan;
    }

    emit(onEvent, {
      type: "plan",
      data: plan,
    });
  }

  let latestDraft = "";
  let latestCritic: CriticResult = {
    status: "FAIL",
    gaps: ["No critique generated."],
    final_verdict: "No critique was generated.",
  };

  let attempt = 0;
  while (attempt < args.maxAttempts) {
    attempt += 1;

    emit(onEvent, {
      type: "status",
      stage: "writer",
      attempt,
      message: `${formatWriterStatus(attempt)} (Attempt ${attempt})`,
    });

    const writerResult = await withHeartbeat(`writer-${attempt}`, onEvent, async () => {
      return args.runners.runWriter({
        problem: args.input.problem,
        attempt: args.input.attempt,
        plan,
        mode: args.mode,
        previousDraft: latestDraft || undefined,
        criticGaps: latestCritic.gaps,
        modelTier: args.modelTier,
        onDelta: (delta) => {
          if (!onEvent) {
            return;
          }

          emit(onEvent, {
            type: "draft_delta",
            attempt,
            delta,
          });
        },
        onFallback: (from, to) => {
          emit(onEvent, {
            type: "status",
            stage: "writer",
            attempt,
            message: `Writer model fallback: ${from} -> ${to}`,
          });
        },
      });
    });

    modelsUsed.add(writerResult.modelId);
    latestDraft = writerResult.markdown;

    emit(onEvent, {
      type: "draft_complete",
      attempt,
      markdown: latestDraft,
    });

    const latexLint = lintLatexMarkdown(latestDraft);

    emit(onEvent, {
      type: "status",
      stage: "critic",
      attempt,
      message: `Critic review in progress... (Attempt ${attempt})`,
    });

    const criticResult = await withHeartbeat(`critic-${attempt}`, onEvent, async () => {
      return args.runners.runCritic({
        plan,
        draft: latestDraft,
        mode: args.mode,
        modelTier: args.modelTier,
        onFallback: (from, to) => {
          emit(onEvent, {
            type: "status",
            stage: "critic",
            attempt,
            message: `Critic model fallback: ${from} -> ${to}`,
          });
        },
      });
    });

    modelsUsed.add(criticResult.modelId);

    const mergedGaps = [...criticResult.critic.gaps, ...latexLint.warnings];

    latestCritic = {
      ...criticResult.critic,
      gaps: mergedGaps,
      final_verdict:
        mergedGaps.length > 0 && criticResult.critic.status === "PASS"
          ? `${criticResult.critic.final_verdict} (with LaTeX warnings)`
          : criticResult.critic.final_verdict,
    };

    emit(onEvent, {
      type: "critique",
      attempt,
      status: latestCritic.status,
      gaps: latestCritic.gaps,
    });

    const isAccepted = latestCritic.status === "PASS" && latestCritic.gaps.length === 0;
    if (isAccepted || attempt >= args.maxAttempts) {
      break;
    }
  }

  const auditStatus =
    latestCritic.status === "PASS"
      ? latestCritic.gaps.length > 0
        ? "PASSED_WITH_WARNINGS"
        : "PASS"
      : "FAIL";

  const audit: AuditReport = {
    status: auditStatus,
    attempts: attempt,
    critiques: latestCritic.gaps,
    final_verdict: latestCritic.final_verdict,
  };

  const payload: FinalProofPayload = {
    runId: args.runId,
    strategy: plan.meta.strategy,
    attempts: attempt,
    mode: args.mode,
    variantRole: args.variantRole,
    isBackground: args.isBackground,
    plan,
    proofMarkdown: latestDraft,
    audit,
    mentalModel: getMentalModel(plan.meta.strategy),
  };

  return {
    payload,
    modelsUsed: Array.from(modelsUsed),
    latencyMs: Date.now() - startedAt,
    runId: args.runId,
  };
}

export type JobStateSummary = {
  jobId: string;
  status: JobStatus;
};

