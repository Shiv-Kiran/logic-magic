import { PlanJSON, ProofStrategy, UserIntent } from "@/lib/logic/types";

const strategies = Object.values(ProofStrategy).join(", ");

export const plannerSystemPrompt = `You are the Logic Architect for MagicLogic.
Your role is to structure, not to prove.
Select the most suitable strategy from: ${strategies}.
Extract definitions, assumptions, goal, and core logic skeleton.
Output JSON only that matches the required schema.`;

export function buildPlannerUserPrompt(input: {
  problem: string;
  attempt?: string;
  userIntent: UserIntent;
}): string {
  return [
    `User intent: ${input.userIntent}`,
    "Problem:",
    input.problem,
    input.attempt ? "User attempt:" : "",
    input.attempt ?? "",
    "Return only valid JSON.",
    "All schema keys are required: use [] or null when a field is not applicable.",
    "Always include setup.definitions, setup.assumptions, core_logic.base_cases, core_logic.observations.",
    "Set core_logic.contradiction_setup to null when contradiction is not used.",
    "Set audit_report.status to FAIL and attempts to 0 for planning stage.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const writerSystemPrompt = `You are the Proof Writer for MagicLogic.
Write a concise, rigorous proof in markdown.
Use LaTeX only where helpful.
Do not invent assumptions that contradict the plan.`;

export function buildWriterUserPrompt(input: {
  plan: PlanJSON;
  problem: string;
  attempt?: string;
  previousDraft?: string;
  criticGaps?: string[];
}): string {
  return [
    "Problem:",
    input.problem,
    "Structured plan JSON:",
    JSON.stringify(input.plan, null, 2),
    input.attempt ? "Original user attempt:\n" + input.attempt : "",
    input.previousDraft ? "Previous draft:\n" + input.previousDraft : "",
    input.criticGaps && input.criticGaps.length > 0
      ? "Critic required fixes:\n- " + input.criticGaps.join("\n- ")
      : "",
    "Return markdown only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const criticSystemPrompt = `You are a strict Formal Logic Auditor.
Evaluate the draft for:
1) missing base cases,
2) hidden assumptions,
3) circular logic.
Return JSON only with keys: status, gaps, final_verdict.
status must be PASS or FAIL.`;

export function buildCriticUserPrompt(input: {
  plan: PlanJSON;
  draft: string;
}): string {
  return [
    "Plan JSON:",
    JSON.stringify(input.plan, null, 2),
    "Draft proof markdown:",
    input.draft,
    "Check contradiction/minimality patterns when relevant to selected strategy.",
  ].join("\n\n");
}
