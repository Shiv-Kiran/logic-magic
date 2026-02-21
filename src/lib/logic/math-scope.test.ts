import { describe, expect, it } from "vitest";
import { assessMathScope } from "@/lib/logic/math-scope";

describe("math scope assessment", () => {
  it("allows clear math-proof prompts", async () => {
    const result = await assessMathScope({
      problem: "Show that sqrt(2) is irrational using contradiction.",
    });

    expect(result.verdict).toBe("ALLOW");
  });

  it("blocks clearly non-math requests", async () => {
    const result = await assessMathScope({
      problem: "Write a short marketing email for my new coffee shop launch.",
    });

    expect(result.verdict).toBe("BLOCK");
  });

  it("uses model classifier when heuristic is ambiguous", async () => {
    const result = await assessMathScope({
      problem: "Can you help with this claim?",
      classifyAmbiguous: async () => ({
        verdict: "ALLOW",
        confidence: 0.85,
        reason: "The user asks for claim validation in a theorem style.",
        suggestion: "Proceed with a formal proof template.",
      }),
    });

    expect(result.verdict).toBe("ALLOW");
  });
});
