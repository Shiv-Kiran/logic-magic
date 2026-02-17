import { describe, expect, it } from "vitest";
import { executeWithModelFallback } from "@/lib/logic/llm";

describe("executeWithModelFallback", () => {
  it("returns primary model result when primary succeeds", async () => {
    const calls: string[] = [];

    const result = await executeWithModelFallback({
      primaryModel: "gpt-5",
      fallbackModel: "gpt-4.1",
      runWithModel: async (modelId) => {
        calls.push(modelId);
        return "ok";
      },
    });

    expect(result).toEqual({ result: "ok", modelId: "gpt-5" });
    expect(calls).toEqual(["gpt-5"]);
  });

  it("uses fallback model after primary failure", async () => {
    const calls: string[] = [];
    const fallbackSignals: Array<[string, string]> = [];

    const result = await executeWithModelFallback({
      primaryModel: "gpt-5",
      fallbackModel: "gpt-4.1",
      onFallback: (from, to) => {
        fallbackSignals.push([from, to]);
      },
      runWithModel: async (modelId) => {
        calls.push(modelId);
        if (modelId === "gpt-5") {
          throw new Error("Primary timeout");
        }

        return "fallback-ok";
      },
    });

    expect(result).toEqual({ result: "fallback-ok", modelId: "gpt-4.1" });
    expect(calls).toEqual(["gpt-5", "gpt-4.1"]);
    expect(fallbackSignals).toEqual([["gpt-5", "gpt-4.1"]]);
  });

  it("throws a combined error when both primary and fallback fail", async () => {
    await expect(
      executeWithModelFallback({
        primaryModel: "gpt-5",
        fallbackModel: "gpt-4.1",
        runWithModel: async (modelId) => {
          throw new Error(`${modelId} failed`);
        },
      }),
    ).rejects.toThrow("Primary and fallback models failed");
  });

  it("does not fallback on schema validation errors", async () => {
    const calls: string[] = [];

    await expect(
      executeWithModelFallback({
        primaryModel: "gpt-5",
        fallbackModel: "gpt-4.1",
        runWithModel: async (modelId) => {
          calls.push(modelId);
          throw new Error(
            "Invalid schema for response_format 'response': Missing required keys.",
          );
        },
      }),
    ).rejects.toThrow("Invalid schema for response_format");

    expect(calls).toEqual(["gpt-5"]);
  });
});
