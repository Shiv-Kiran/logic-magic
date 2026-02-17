export enum ProofStrategy {
  DIRECT_PROOF = "DIRECT_PROOF",
  CONTRADICTION_GENERAL = "CONTRADICTION_GENERAL",
  CONTRADICTION_MINIMALITY = "CONTRADICTION_MINIMALITY",
  INDUCTION_WEAK = "INDUCTION_WEAK",
  INDUCTION_STRONG = "INDUCTION_STRONG",
  GREEDY_EXCHANGE = "GREEDY_EXCHANGE",
  INVARIANT_MAINTENANCE = "INVARIANT_MAINTENANCE",
  PIGEONHOLE_PRINCIPLE = "PIGEONHOLE_PRINCIPLE",
  CONSTRUCTIVE = "CONSTRUCTIVE",
  CASE_ANALYSIS = "CASE_ANALYSIS",
}

export type UserIntent = "LEARNING" | "VERIFICATION";

export type AuditStatus = "PASS" | "FAIL" | "PASSED_WITH_WARNINGS";

export type CriticStatus = "PASS" | "FAIL";

export type PlanStepType = "step" | "math";

export type PlanStep = {
  type: PlanStepType;
  content: string;
};

export type ContradictionSetup = {
  assumption: string;
  implication: string;
  climax: string;
};

export type PlanJSON = {
  meta: {
    strategy: ProofStrategy;
    confidence_score: number;
    user_intent: UserIntent;
  };
  setup: {
    definitions: string[];
    assumptions: string[];
    goal: string;
  };
  core_logic: {
    invariant: string;
    base_cases: string[];
    contradiction_setup: ContradictionSetup | null;
    observations: string[];
  };
  steps: PlanStep[];
  audit_report: AuditReport;
};

export type AuditReport = {
  status: AuditStatus;
  attempts: number;
  critiques: string[];
  final_verdict: string;
};

export type CriticResult = {
  status: CriticStatus;
  gaps: string[];
  final_verdict: string;
};

export type GenerateProofRequest = {
  problem: string;
  attempt?: string;
  userIntent: UserIntent;
};

export type MentalModel = {
  title: string;
  trick: string;
  logic: string;
  invariant: string;
};

export type FinalProofPayload = {
  strategy: ProofStrategy;
  attempts: number;
  plan: PlanJSON;
  proofMarkdown: string;
  audit: AuditReport;
  mentalModel: MentalModel;
};

export type StreamEvent =
  | { type: "status"; message: string; attempt?: number }
  | { type: "plan"; data: PlanJSON }
  | { type: "draft"; attempt: number; markdown: string }
  | { type: "critique"; attempt: number; status: CriticStatus; gaps: string[] }
  | { type: "final"; data: FinalProofPayload }
  | { type: "error"; code: string; message: string };
