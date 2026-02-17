import { getMentalModel } from "@/lib/logic/mental-model";
import {
  AuditReport,
  CriticResult,
  FinalProofPayload,
  GenerateProofRequest,
  PlanJSON,
  StreamEvent,
} from "@/lib/logic/types";

type OnEvent = (event: StreamEvent) => void;

type PlannerRunResult = {
  plan: PlanJSON;
  modelId: string;
};

type WriterRunResult = {
  markdown: string;
  modelId: string;
};

type CriticRunResult = {
  critic: CriticResult;
  modelId: string;
};

export type PersistProofRecord = {
  input: GenerateProofRequest;
  payload: FinalProofPayload;
  modelPrimary: string;
  modelFallback?: string;
  modelsUsed: string[];
  latencyMs: number;
};

export type PipelineDependencies = {
  runPlanner: (args: {
    problem: string;
    attempt?: string;
    userIntent: GenerateProofRequest["userIntent"];
    repairMode?: boolean;
    onFallback?: (from: string, to: string) => void;
  }) => Promise<PlannerRunResult>;
  runWriter: (args: {
    problem: string;
    attempt?: string;
    plan: PlanJSON;
    previousDraft?: string;
    criticGaps?: string[];
    onFallback?: (from: string, to: string) => void;
  }) => Promise<WriterRunResult>;
  runCritic: (args: {
    plan: PlanJSON;
    draft: string;
    onFallback?: (from: string, to: string) => void;
  }) => Promise<CriticRunResult>;
  persistProof?: (record: PersistProofRecord) => Promise<void>;
  now?: () => number;
};

export type OrchestratorResult = {
  payload: FinalProofPayload;
  modelsUsed: string[];
  latencyMs: number;
};

const MAX_ATTEMPTS = 3;

function emitStatus(onEvent: OnEvent, message: string, attempt?: number): void {
  onEvent({ type: "status", message, attempt });
}

function formatWriterStatus(attempt: number): string {
  if (attempt === 1) {
    return "Drafting...";
  }

  if (attempt === MAX_ATTEMPTS) {
    return "Final Polish...";
  }

  return "Refining Logic...";
}

export async function runProofPipeline(
  input: GenerateProofRequest,
  deps: PipelineDependencies,
  onEvent: OnEvent,
  modelPrimary: string,
  modelFallback?: string,
): Promise<OrchestratorResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const modelsUsed = new Set<string>();

  emitStatus(onEvent, "Analyzing Logic Structure...");

  let plannerResult: PlannerRunResult;
  try {
    plannerResult = await deps.runPlanner({
      problem: input.problem,
      attempt: input.attempt,
      userIntent: input.userIntent,
      onFallback: (from, to) => {
        emitStatus(onEvent, `Planner model fallback: ${from} -> ${to}`);
      },
    });
  } catch {
    emitStatus(onEvent, "Planner output invalid. Retrying with strict JSON constraints...");
    plannerResult = await deps.runPlanner({
      problem: input.problem,
      attempt: input.attempt,
      userIntent: input.userIntent,
      repairMode: true,
      onFallback: (from, to) => {
        emitStatus(onEvent, `Planner model fallback: ${from} -> ${to}`);
      },
    });
  }

  modelsUsed.add(plannerResult.modelId);
  const plan = plannerResult.plan;
  onEvent({ type: "plan", data: plan });

  let attempt = 0;
  let currentDraft = "";
  let latestCritic: CriticResult = {
    status: "FAIL",
    gaps: ["No critique generated."],
    final_verdict: "The process ended before receiving critic output.",
  };

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;

    emitStatus(onEvent, `${formatWriterStatus(attempt)} (Attempt ${attempt})`, attempt);

    const writerResult = await deps.runWriter({
      problem: input.problem,
      attempt: input.attempt,
      plan,
      previousDraft: currentDraft || undefined,
      criticGaps: latestCritic.gaps,
      onFallback: (from, to) => {
        emitStatus(onEvent, `Writer model fallback: ${from} -> ${to}`, attempt);
      },
    });

    modelsUsed.add(writerResult.modelId);
    currentDraft = writerResult.markdown.trim();

    onEvent({
      type: "draft",
      attempt,
      markdown: currentDraft,
    });

    emitStatus(onEvent, `Critic review in progress... (Attempt ${attempt})`, attempt);

    const criticResult = await deps.runCritic({
      plan,
      draft: currentDraft,
      onFallback: (from, to) => {
        emitStatus(onEvent, `Critic model fallback: ${from} -> ${to}`, attempt);
      },
    });

    modelsUsed.add(criticResult.modelId);
    latestCritic = criticResult.critic;

    onEvent({
      type: "critique",
      attempt,
      status: latestCritic.status,
      gaps: latestCritic.gaps,
    });

    if (latestCritic.status === "PASS") {
      break;
    }
  }

  const auditStatus =
    latestCritic.status === "PASS"
      ? latestCritic.gaps.length > 0
        ? "PASSED_WITH_WARNINGS"
        : "PASS"
      : "FAIL";

  const auditReport: AuditReport = {
    status: auditStatus,
    attempts: attempt,
    critiques: latestCritic.gaps,
    final_verdict: latestCritic.final_verdict,
  };

  const payload: FinalProofPayload = {
    strategy: plan.meta.strategy,
    attempts: attempt,
    plan,
    proofMarkdown: currentDraft,
    audit: auditReport,
    mentalModel: getMentalModel(plan.meta.strategy),
  };

  onEvent({ type: "final", data: payload });

  const latencyMs = now() - startedAt;

  if (deps.persistProof && auditStatus !== "FAIL") {
    try {
      await deps.persistProof({
        input,
        payload,
        modelPrimary,
        modelFallback,
        modelsUsed: Array.from(modelsUsed),
        latencyMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown persistence error";
      emitStatus(onEvent, `Supabase persistence warning: ${message}`);
    }
  }

  return {
    payload,
    modelsUsed: Array.from(modelsUsed),
    latencyMs,
  };
}
