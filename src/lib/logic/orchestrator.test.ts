import { describe, expect, it, vi } from "vitest";
import { runProofPipeline } from "@/lib/logic/orchestrator";
import { PlanJSON, ProofStrategy } from "@/lib/logic/types";

const basePlan: PlanJSON = {
  meta: {
    strategy: ProofStrategy.CONTRADICTION_MINIMALITY,
    confidence_score: 0.95,
    user_intent: "LEARNING",
  },
  setup: {
    definitions: ["Let S be the settled set."],
    assumptions: ["All weights are non-negative."],
    goal: "Prove Dijkstra is correct.",
  },
  core_logic: {
    invariant: "Settled nodes are optimal.",
    base_cases: ["Source has distance 0."],
    contradiction_setup: null,
    observations: ["First failure argument across settled nodes."],
  },
  steps: [
    {
      type: "step",
      content: "Assume first incorrect settled node exists.",
    },
  ],
  audit_report: {
    status: "FAIL",
    attempts: 0,
    critiques: ["Planning stage only"],
    final_verdict: "Pending",
  },
};

const input = {
  problem: "Show Dijkstra works using contradiction.",
  userIntent: "LEARNING" as const,
};

describe("runProofPipeline", () => {
  it("persists when critic passes on first attempt", async () => {
    const events: string[] = [];
    const persistProof = vi.fn(async () => undefined);

    const result = await runProofPipeline(
      input,
      {
        runPlanner: async () => ({
          plan: basePlan,
          modelId: "gpt-5",
        }),
        runWriter: async () => ({
          markdown: "Final proof text",
          modelId: "gpt-5",
        }),
        runCritic: async () => ({
          critic: {
            status: "PASS",
            gaps: [],
            final_verdict: "Valid proof",
          },
          modelId: "gpt-5",
        }),
        persistProof,
      },
      (event) => {
        events.push(event.type);
      },
      "gpt-5",
      "gpt-4.1",
    );

    expect(result.payload.audit.status).toBe("PASS");
    expect(result.payload.attempts).toBe(1);
    expect(events).toContain("final");
    expect(persistProof).toHaveBeenCalledTimes(1);
  });

  it("retries planner once with repair mode when first planner call fails", async () => {
    const planner = vi
      .fn()
      .mockRejectedValueOnce(new Error("Malformed planner output"))
      .mockResolvedValue({
        plan: basePlan,
        modelId: "gpt-5",
      });

    const result = await runProofPipeline(
      input,
      {
        runPlanner: planner,
        runWriter: async () => ({
          markdown: "Recovered draft",
          modelId: "gpt-5",
        }),
        runCritic: async () => ({
          critic: {
            status: "PASS",
            gaps: [],
            final_verdict: "Pass after repair",
          },
          modelId: "gpt-5",
        }),
      },
      () => {},
      "gpt-5",
      "gpt-4.1",
    );

    expect(result.payload.audit.status).toBe("PASS");
    expect(planner).toHaveBeenCalledTimes(2);
    expect(planner.mock.calls[1][0].repairMode).toBe(true);
  });

  it("returns terminal FAIL after 3 critic failures and skips persistence", async () => {
    const persistProof = vi.fn(async () => undefined);
    const drafts = ["draft-1", "draft-2", "draft-3"];
    let writerCallCount = 0;

    const result = await runProofPipeline(
      input,
      {
        runPlanner: async () => ({
          plan: basePlan,
          modelId: "gpt-5",
        }),
        runWriter: async () => {
          const markdown = drafts[writerCallCount];
          writerCallCount += 1;
          return {
            markdown,
            modelId: "gpt-5",
          };
        },
        runCritic: async () => ({
          critic: {
            status: "FAIL",
            gaps: ["Missing base case"],
            final_verdict: "Still incomplete",
          },
          modelId: "gpt-5",
        }),
        persistProof,
      },
      () => {},
      "gpt-5",
      "gpt-4.1",
    );

    expect(result.payload.audit.status).toBe("FAIL");
    expect(result.payload.attempts).toBe(3);
    expect(result.payload.proofMarkdown).toBe("draft-3");
    expect(persistProof).not.toHaveBeenCalled();
  });

  it("persists when critic passes on second attempt", async () => {
    const persistProof = vi.fn(async () => undefined);
    let criticCalls = 0;

    const result = await runProofPipeline(
      input,
      {
        runPlanner: async () => ({
          plan: basePlan,
          modelId: "gpt-5",
        }),
        runWriter: async ({ previousDraft }) => ({
          markdown: previousDraft ? "improved draft" : "initial draft",
          modelId: "gpt-5",
        }),
        runCritic: async () => {
          criticCalls += 1;
          if (criticCalls === 1) {
            return {
              critic: {
                status: "FAIL",
                gaps: ["State base case explicitly"],
                final_verdict: "Needs one fix",
              },
              modelId: "gpt-5",
            };
          }

          return {
            critic: {
              status: "PASS",
              gaps: [],
              final_verdict: "Complete",
            },
            modelId: "gpt-5",
          };
        },
        persistProof,
      },
      () => {},
      "gpt-5",
      "gpt-4.1",
    );

    expect(result.payload.audit.status).toBe("PASS");
    expect(result.payload.attempts).toBe(2);
    expect(persistProof).toHaveBeenCalledTimes(1);
  });
});
