import { PlanJSON, ProofMode, ProofStrategy, UserIntent, VariantRole } from "@/lib/logic/types";

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

const mathFormalModeInstruction = [
  "Mode: MATH_FORMAL.",
  "Write a highly formal, concise theorem-proof style response.",
  "Prefer symbolic derivations and compact argument steps.",
  "Minimize prose and avoid storytelling.",
  "Use KaTeX-compatible delimiters: inline $...$, display $$...$$.",
  "Structure with numbered steps and short lines (roughly <= 110 chars).",
  "Move long equations to standalone display lines using $$...$$.",
].join(" ");

const explanatoryModeInstruction = [
  "Mode: EXPLANATORY.",
  "Write an intuitive explanation-first proof with clear transitions.",
  "Keep equations, but explain why each step is valid in plain language.",
  "Still keep rigor and avoid handwaving.",
  "Use KaTeX-compatible delimiters: inline $...$, display $$...$$.",
  "Structure with numbered steps and short lines (roughly <= 110 chars).",
  "Move long equations to standalone display lines using $$...$$.",
].join(" ");

export const writerSystemPrompt = `You are the Proof Writer for MagicLogic.
Write a rigorous proof in markdown.
Do not invent assumptions that contradict the plan.
Do not use \\( \\) or \\[ \\] delimiters. Only use $...$ and $$...$$.`;

export function buildWriterUserPrompt(input: {
  plan: PlanJSON;
  problem: string;
  mode: ProofMode;
  attempt?: string;
  previousDraft?: string;
  criticGaps?: string[];
}): string {
  const modeInstruction =
    input.mode === "EXPLANATORY" ? explanatoryModeInstruction : mathFormalModeInstruction;

  return [
    modeInstruction,
    "Problem:",
    input.problem,
    "Structured plan JSON:",
    JSON.stringify(input.plan, null, 2),
    input.attempt ? "Original user attempt:\n" + input.attempt : "",
    input.previousDraft ? "Previous draft:\n" + input.previousDraft : "",
    input.criticGaps && input.criticGaps.length > 0
      ? "Required fixes:\n- " + input.criticGaps.join("\n- ")
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
status must be PASS or FAIL.
Also flag formatting that violates short stepwise structure or uses non-KaTeX delimiters.`;

export function buildCriticUserPrompt(input: {
  plan: PlanJSON;
  draft: string;
  mode: ProofMode;
}): string {
  const modeCheck =
    input.mode === "MATH_FORMAL"
      ? "Verify that language stays compact and mathematically formal."
      : "Verify that explanations are clear and each equation is justified in plain language.";

  return [
    `Mode: ${input.mode}`,
    "Plan JSON:",
    JSON.stringify(input.plan, null, 2),
    "Draft proof markdown:",
    input.draft,
    "Check contradiction/minimality patterns when relevant to selected strategy.",
    "Check delimiter usage: only $...$ and $$...$$ are acceptable.",
    modeCheck,
  ].join("\n\n");
}

export const followupSystemPrompt = `You are a formal math logician mentor.
Answer with strict brevity and rigor.
Use equation-first style where helpful.
No fluff, no motivational text, no long preambles.
If the question is ambiguous, ask one precise clarifying sentence.
Output 3 to 8 short lines.
Use only KaTeX-safe delimiters: $...$ and $$...$$.`;

export function buildFollowupUserPrompt(input: {
  question: string;
  modeHint?: ProofMode;
  context?: {
    problem: string;
    strategy: string;
    variantRole: VariantRole;
    proofMarkdown: string;
  };
}): string {
  return [
    input.modeHint ? `Mode hint: ${input.modeHint}` : "",
    input.context
      ? [
          "Reference context (use only if relevant):",
          `Problem: ${input.context.problem}`,
          `Strategy: ${input.context.strategy}`,
          `Variant: ${input.context.variantRole}`,
          "Proof excerpt:",
          input.context.proofMarkdown,
        ].join("\n")
      : "",
    "User question:",
    input.question,
    "Return concise markdown only.",
    "Prefer short numbered steps.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
