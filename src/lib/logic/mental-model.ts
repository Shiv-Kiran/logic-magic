import { MentalModel, ProofStrategy } from "@/lib/logic/types";

const DEFAULT_MODEL: MentalModel = {
  title: "Direct Proof",
  trick: "Assume the premises and push forward with valid implications.",
  logic: "Every step should reduce distance to the target claim without contradiction.",
  invariant: "Each established statement remains true and reusable.",
};

const MENTAL_MODEL_BY_STRATEGY: Record<ProofStrategy, MentalModel> = {
  [ProofStrategy.DIRECT_PROOF]: DEFAULT_MODEL,
  [ProofStrategy.CONTRADICTION_GENERAL]: {
    title: "Contradiction (General)",
    trick: "Assume the negation and force an impossible conclusion.",
    logic: "If assumptions imply both a claim and its negation, the negation is false.",
    invariant: "Logical rules remain valid under temporary negation assumptions.",
  },
  [ProofStrategy.CONTRADICTION_MINIMALITY]: {
    title: "Minimal Counterexample",
    trick: "Assume failure and choose the first or smallest failure.",
    logic: "If that failure implies an even earlier failure, contradiction follows.",
    invariant: "All earlier cases are correct by minimality.",
  },
  [ProofStrategy.INDUCTION_WEAK]: {
    title: "Weak Induction",
    trick: "Prove base case, then n implies n+1.",
    logic: "A chain from the base case covers all natural numbers.",
    invariant: "Induction hypothesis is valid for the current n.",
  },
  [ProofStrategy.INDUCTION_STRONG]: {
    title: "Strong Induction",
    trick: "Assume all earlier cases and prove n.",
    logic: "The stronger hypothesis unlocks recursive dependencies.",
    invariant: "All k < n satisfy the property during the step.",
  },
  [ProofStrategy.GREEDY_EXCHANGE]: {
    title: "Greedy Exchange",
    trick: "Swap an optimal solution toward the greedy choice without worsening it.",
    logic: "If exchange preserves optimality, greedy can be part of an optimal solution.",
    invariant: "Each exchange keeps solution feasibility and objective value.",
  },
  [ProofStrategy.INVARIANT_MAINTENANCE]: {
    title: "Invariant Maintenance",
    trick: "State a condition that is true before and after each iteration.",
    logic: "Initialization + maintenance + termination implies correctness.",
    invariant: "Declared invariant statement itself.",
  },
  [ProofStrategy.PIGEONHOLE_PRINCIPLE]: {
    title: "Pigeonhole",
    trick: "Show more objects than containers under given constraints.",
    logic: "At least one container must hold multiple objects.",
    invariant: "Total count and container count bounds are fixed.",
  },
  [ProofStrategy.CONSTRUCTIVE]: {
    title: "Constructive Proof",
    trick: "Build an explicit witness that satisfies the claim.",
    logic: "Verification of the constructed object proves existence.",
    invariant: "Construction constraints remain satisfied at every step.",
  },
  [ProofStrategy.CASE_ANALYSIS]: {
    title: "Case Analysis",
    trick: "Partition the domain into exhaustive, disjoint cases.",
    logic: "If each case implies the claim, the whole domain does too.",
    invariant: "Case partition remains complete and non-overlapping.",
  },
};

export function getMentalModel(strategy: ProofStrategy): MentalModel {
  return MENTAL_MODEL_BY_STRATEGY[strategy] ?? DEFAULT_MODEL;
}
