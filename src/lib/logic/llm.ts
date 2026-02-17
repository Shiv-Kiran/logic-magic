import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, LanguageModel } from "ai";
import {
  buildCriticUserPrompt,
  buildPlannerUserPrompt,
  buildWriterUserPrompt,
  criticSystemPrompt,
  criticResultSchema,
  planJsonSchema,
  plannerSystemPrompt,
  writerSystemPrompt,
} from "@/lib/logic";

export type ModelRunnerConfig = {
  apiKey: string;
  modelPrimary: string;
  modelFallback?: string;
  timeoutMs: number;
};

type FallbackArgs = {
  onFallback?: (from: string, to: string) => void;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown model invocation error";
}

export function createModelRunners(config: ModelRunnerConfig) {
  const provider = createOpenAI({
    apiKey: config.apiKey,
  });

  const getModel = (modelId: string): LanguageModel => provider.responses(modelId as never);

  async function executeWithFallback<T>(
    run: (model: LanguageModel) => Promise<T>,
    args: FallbackArgs,
  ): Promise<{ result: T; modelId: string }> {
    try {
      const result = await run(getModel(config.modelPrimary));
      return {
        result,
        modelId: config.modelPrimary,
      };
    } catch (primaryError) {
      const hasFallback =
        typeof config.modelFallback === "string" &&
        config.modelFallback.length > 0 &&
        config.modelFallback !== config.modelPrimary;

      if (!hasFallback) {
        throw primaryError;
      }

      args.onFallback?.(config.modelPrimary, config.modelFallback!);

      try {
        const fallbackResult = await run(getModel(config.modelFallback!));
        return {
          result: fallbackResult,
          modelId: config.modelFallback!,
        };
      } catch (fallbackError) {
        throw new Error(
          `Primary and fallback models failed. Primary: ${toErrorMessage(primaryError)}. Fallback: ${toErrorMessage(fallbackError)}.`,
        );
      }
    }
  }

  return {
    async runPlanner(args: {
      problem: string;
      attempt?: string;
      userIntent: "LEARNING" | "VERIFICATION";
      repairMode?: boolean;
      onFallback?: (from: string, to: string) => void;
    }) {
      const prompt = buildPlannerUserPrompt({
        problem: args.problem,
        attempt: args.attempt,
        userIntent: args.userIntent,
      });

      const repairSuffix = args.repairMode
        ? "Return strict JSON only. Do not add markdown fences, extra prose, or trailing text."
        : "";

      const { result, modelId } = await executeWithFallback(
        async (model) => {
          const output = await generateObject({
            model,
            schema: planJsonSchema,
            system: plannerSystemPrompt,
            prompt: [prompt, repairSuffix].filter(Boolean).join("\n\n"),
            maxRetries: 1,
            timeout: config.timeoutMs,
            temperature: 0.1,
          });

          return output.object;
        },
        args,
      );

      return {
        plan: result,
        modelId,
      };
    },

    async runWriter(args: {
      problem: string;
      attempt?: string;
      plan: Parameters<typeof buildWriterUserPrompt>[0]["plan"];
      previousDraft?: string;
      criticGaps?: string[];
      onFallback?: (from: string, to: string) => void;
    }) {
      const { result, modelId } = await executeWithFallback(
        async (model) => {
          const output = await generateText({
            model,
            system: writerSystemPrompt,
            prompt: buildWriterUserPrompt({
              plan: args.plan,
              problem: args.problem,
              attempt: args.attempt,
              previousDraft: args.previousDraft,
              criticGaps: args.criticGaps,
            }),
            maxRetries: 1,
            timeout: config.timeoutMs,
            temperature: 0.2,
          });

          const markdown = output.text.trim();
          if (!markdown) {
            throw new Error("Writer returned an empty draft.");
          }

          return markdown;
        },
        args,
      );

      return {
        markdown: result,
        modelId,
      };
    },

    async runCritic(args: {
      plan: Parameters<typeof buildCriticUserPrompt>[0]["plan"];
      draft: string;
      onFallback?: (from: string, to: string) => void;
    }) {
      const { result, modelId } = await executeWithFallback(
        async (model) => {
          const output = await generateObject({
            model,
            schema: criticResultSchema,
            system: criticSystemPrompt,
            prompt: buildCriticUserPrompt({
              plan: args.plan,
              draft: args.draft,
            }),
            maxRetries: 1,
            timeout: config.timeoutMs,
            temperature: 0,
          });

          return output.object;
        },
        args,
      );

      return {
        critic: result,
        modelId,
      };
    },
  };
}
