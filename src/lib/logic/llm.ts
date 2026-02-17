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

export type ExecuteWithModelFallbackArgs<T> = {
  primaryModel: string;
  fallbackModel?: string;
  onFallback?: (from: string, to: string) => void;
  runWithModel: (modelId: string) => Promise<T>;
};

function isReasoningModel(modelId: string): boolean {
  return modelId.startsWith("gpt-5") || modelId.startsWith("o");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown model invocation error";
}

function shouldSkipFallback(error: unknown): boolean {
  const message = toErrorMessage(error);

  return (
    message.includes("Invalid schema for response_format") ||
    message.includes("Invalid schema for response_format 'response'")
  );
}

function withModelTimeout<T>(
  timeoutMs: number,
  run: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return run(controller.signal)
    .catch((error) => {
      if (controller.signal.aborted) {
        throw new Error(`Model call timed out after ${timeoutMs}ms.`);
      }

      throw error;
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

export async function executeWithModelFallback<T>(
  args: ExecuteWithModelFallbackArgs<T>,
): Promise<{ result: T; modelId: string }> {
  try {
    return {
      result: await args.runWithModel(args.primaryModel),
      modelId: args.primaryModel,
    };
  } catch (primaryError) {
    if (shouldSkipFallback(primaryError)) {
      throw primaryError;
    }

    const hasFallback =
      typeof args.fallbackModel === "string" &&
      args.fallbackModel.length > 0 &&
      args.fallbackModel !== args.primaryModel;

    if (!hasFallback) {
      throw primaryError;
    }

    args.onFallback?.(args.primaryModel, args.fallbackModel!);

    try {
      return {
        result: await args.runWithModel(args.fallbackModel!),
        modelId: args.fallbackModel!,
      };
    } catch (fallbackError) {
      throw new Error(
        `Primary and fallback models failed. Primary: ${toErrorMessage(primaryError)}. Fallback: ${toErrorMessage(fallbackError)}.`,
      );
    }
  }
}

export function createModelRunners(config: ModelRunnerConfig) {
  const provider = createOpenAI({
    apiKey: config.apiKey,
  });

  const getModel = (modelId: string): LanguageModel => provider.responses(modelId as never);

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

      const { result, modelId } = await executeWithModelFallback({
        primaryModel: config.modelPrimary,
        fallbackModel: config.modelFallback,
        onFallback: args.onFallback,
        runWithModel: async (modelIdToUse) => {
          const output = await withModelTimeout(config.timeoutMs, async (abortSignal) => {
            return generateObject({
              model: getModel(modelIdToUse),
              schema: planJsonSchema,
              system: plannerSystemPrompt,
              prompt: [prompt, repairSuffix].filter(Boolean).join("\n\n"),
              maxRetries: 1,
              abortSignal,
              timeout: config.timeoutMs,
              ...(isReasoningModel(modelIdToUse)
                ? {
                    providerOptions: {
                      openai: {
                        reasoningEffort: "minimal",
                      },
                    },
                  }
                : {
                    temperature: 0.1,
                  }),
            });
          });

          return output.object;
        },
      });

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
      const { result, modelId } = await executeWithModelFallback({
        primaryModel: config.modelPrimary,
        fallbackModel: config.modelFallback,
        onFallback: args.onFallback,
        runWithModel: async (modelIdToUse) => {
          const output = await withModelTimeout(config.timeoutMs, async (abortSignal) => {
            return generateText({
              model: getModel(modelIdToUse),
              system: writerSystemPrompt,
              prompt: buildWriterUserPrompt({
                plan: args.plan,
                problem: args.problem,
                attempt: args.attempt,
                previousDraft: args.previousDraft,
                criticGaps: args.criticGaps,
              }),
              maxRetries: 1,
              abortSignal,
              timeout: config.timeoutMs,
              ...(isReasoningModel(modelIdToUse)
                ? {
                    providerOptions: {
                      openai: {
                        reasoningEffort: "minimal",
                      },
                    },
                  }
                : {
                    temperature: 0.2,
                  }),
            });
          });

          const markdown = output.text.trim();
          if (!markdown) {
            throw new Error("Writer returned an empty draft.");
          }

          return markdown;
        },
      });

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
      const { result, modelId } = await executeWithModelFallback({
        primaryModel: config.modelPrimary,
        fallbackModel: config.modelFallback,
        onFallback: args.onFallback,
        runWithModel: async (modelIdToUse) => {
          const output = await withModelTimeout(config.timeoutMs, async (abortSignal) => {
            return generateObject({
              model: getModel(modelIdToUse),
              schema: criticResultSchema,
              system: criticSystemPrompt,
              prompt: buildCriticUserPrompt({
                plan: args.plan,
                draft: args.draft,
              }),
              maxRetries: 1,
              abortSignal,
              timeout: config.timeoutMs,
              ...(isReasoningModel(modelIdToUse)
                ? {
                    providerOptions: {
                      openai: {
                        reasoningEffort: "minimal",
                      },
                    },
                  }
                : {
                    temperature: 0,
                  }),
            });
          });

          return output.object;
        },
      });

      return {
        critic: result,
        modelId,
      };
    },
  };
}
