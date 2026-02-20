import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, streamText, LanguageModel } from "ai";
import {
  buildFollowupUserPrompt,
  buildCriticUserPrompt,
  buildPlannerUserPrompt,
  buildWriterUserPrompt,
  criticSystemPrompt,
  followupSystemPrompt,
  plannerSystemPrompt,
  writerSystemPrompt,
} from "@/lib/logic/prompts";
import { normalizeMathDelimiters, trimToLineCount } from "@/lib/logic/formatting";
import { criticResultSchema, planJsonSchema } from "@/lib/logic/schema";
import { ModelTier, PlanJSON, ProofMode, VariantRole } from "@/lib/logic/types";

export type ModelRunnerConfig = {
  apiKey: string;
  modelFast?: string;
  modelQuality?: string;
  modelFollowup?: string;
  modelFallback?: string;
  modelPrimary?: string;
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

function resolveFastModel(config: ModelRunnerConfig): string {
  return config.modelFast ?? config.modelPrimary ?? "gpt-4.1";
}

function resolveQualityModel(config: ModelRunnerConfig): string {
  return config.modelQuality ?? config.modelPrimary ?? resolveFastModel(config);
}

function resolveTierPrimaryModel(config: ModelRunnerConfig, tier: ModelTier): string {
  return tier === "QUALITY" ? resolveQualityModel(config) : resolveFastModel(config);
}

function resolveFollowupModel(config: ModelRunnerConfig): string {
  return config.modelFollowup ?? resolveFastModel(config);
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

      const primaryModel = resolveTierPrimaryModel(config, "FAST");

      const { result, modelId } = await executeWithModelFallback({
        primaryModel,
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
      plan: PlanJSON;
      mode: ProofMode;
      attempt?: string;
      previousDraft?: string;
      criticGaps?: string[];
      modelTier?: ModelTier;
      onDelta?: (delta: string) => void;
      onFallback?: (from: string, to: string) => void;
    }) {
      const primaryModel = resolveTierPrimaryModel(config, args.modelTier ?? "FAST");
      const writerPrompt = buildWriterUserPrompt({
        plan: args.plan,
        problem: args.problem,
        mode: args.mode,
        attempt: args.attempt,
        previousDraft: args.previousDraft,
        criticGaps: args.criticGaps,
      });

      const { result, modelId } = await executeWithModelFallback({
        primaryModel,
        fallbackModel: config.modelFallback,
        onFallback: args.onFallback,
        runWithModel: async (modelIdToUse) => {
          return withModelTimeout(config.timeoutMs, async (abortSignal) => {
            const streamResult = streamText({
              model: getModel(modelIdToUse),
              system: writerSystemPrompt,
              prompt: writerPrompt,
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

            let markdown = "";
            for await (const delta of streamResult.textStream) {
              markdown += delta;
              args.onDelta?.(delta);
            }

            let finalDraft = markdown.trim();
            if (!finalDraft) {
              // Some responses can fail to emit stream deltas even when text exists.
              const recovery = await generateText({
                model: getModel(modelIdToUse),
                system: writerSystemPrompt,
                prompt: writerPrompt,
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

              finalDraft = recovery.text.trim();
              if (finalDraft) {
                args.onDelta?.(finalDraft);
              }
            }

            if (!finalDraft) {
              throw new Error("Writer returned an empty draft.");
            }

            return normalizeMathDelimiters(finalDraft);
          });
        },
      });

      return {
        markdown: result,
        modelId,
      };
    },

    async runCritic(args: {
      plan: PlanJSON;
      draft: string;
      mode: ProofMode;
      modelTier?: ModelTier;
      onFallback?: (from: string, to: string) => void;
    }) {
      const primaryModel = resolveTierPrimaryModel(config, args.modelTier ?? "FAST");

      const { result, modelId } = await executeWithModelFallback({
        primaryModel,
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
                mode: args.mode,
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

    async runFollowup(args: {
      question: string;
      modeHint?: ProofMode;
      context?: {
        problem: string;
        strategy: string;
        variantRole: VariantRole;
        proofMarkdown: string;
      };
      onFallback?: (from: string, to: string) => void;
    }) {
      const primaryModel = resolveFollowupModel(config);

      const { result, modelId } = await executeWithModelFallback({
        primaryModel,
        fallbackModel: config.modelFallback,
        onFallback: args.onFallback,
        runWithModel: async (modelIdToUse) => {
          const output = await withModelTimeout(config.timeoutMs, async (abortSignal) => {
            return generateText({
              model: getModel(modelIdToUse),
              system: followupSystemPrompt,
              prompt: buildFollowupUserPrompt({
                question: args.question,
                modeHint: args.modeHint,
                context: args.context,
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
                    temperature: 0.1,
                  }),
            });
          });

          const normalized = normalizeMathDelimiters(output.text.trim());
          return trimToLineCount(normalized, 8);
        },
      });

      return {
        markdown: result,
        modelId,
        usedContext: args.context ? "RUN_VARIANT" : "NONE",
      };
    },
  };
}

