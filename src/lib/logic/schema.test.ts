import { describe, expect, it } from "vitest";
import { generateProofRequestSchema, planJsonSchema } from "@/lib/logic/schema";
import { ProofStrategy } from "@/lib/logic/types";

const validPlan = {
  meta: {
    strategy: ProofStrategy.CONTRADICTION_MINIMALITY,
    confidence_score: 0.92,
    user_intent: "LEARNING",
  },
  setup: {
    definitions: ["Let S be settled nodes."],
    assumptions: ["Edge weights are non-negative."],
    goal: "Prove Dijkstra returns shortest path distances.",
  },
  core_logic: {
    invariant: "For all x in S, dist[x] is optimal.",
    base_cases: ["dist[s] = 0"],
    contradiction_setup: {
      assumption: "Assume first wrong settled node u.",
      implication: "There exists predecessor y with better path.",
      climax: "Then y should have been selected before u.",
    },
  },
  steps: [
    {
      type: "step",
      content: "Assume contradiction and choose first failing node.",
    },
    {
      type: "math",
      content: "$$ dist[y] < dist[u] $$",
    },
  ],
  audit_report: {
    status: "FAIL",
    attempts: 0,
    critiques: ["Planning stage only"],
    final_verdict: "Pending critic evaluation",
  },
};

describe("schema guards", () => {
  it("accepts a valid generation request", () => {
    const parsed = generateProofRequestSchema.safeParse({
      problem: "Show Dijkstra is correct by contradiction.",
      userIntent: "LEARNING",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an empty problem statement", () => {
    const parsed = generateProofRequestSchema.safeParse({
      problem: "   ",
      userIntent: "LEARNING",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a valid plan JSON payload", () => {
    const parsed = planJsonSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.meta.strategy).toBe(ProofStrategy.CONTRADICTION_MINIMALITY);
    }
  });
});
