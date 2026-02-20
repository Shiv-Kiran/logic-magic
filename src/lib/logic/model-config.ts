import { ModelRunnerConfig } from "@/lib/logic/llm";

export const DEFAULT_TIMEOUT_MS = 20_000;

export type ResolvedModelConfig = {
  modelFast: string;
  modelQuality: string;
  modelFollowup: string;
  modelFallback: string;
  timeoutMs: number;
};

function resolveTimeoutMs(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return parsed;
}

function requireEnvValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required in environment configuration.`);
  }

  return value;
}

export function resolveOpenAiModelConfig(env: NodeJS.ProcessEnv = process.env): ResolvedModelConfig {
  const modelFast = requireEnvValue(env, "OPENAI_MODEL_FAST");
  const modelQuality = env.OPENAI_MODEL_QUALITY?.trim() || modelFast;
  const modelFollowup = env.OPENAI_MODEL_FOLLOWUP?.trim() || modelFast;
  const modelFallback = env.OPENAI_MODEL_FALLBACK?.trim() || modelFast;

  return {
    modelFast,
    modelQuality,
    modelFollowup,
    modelFallback,
    timeoutMs: resolveTimeoutMs(env.OPENAI_TIMEOUT_MS),
  };
}

export function toModelRunnerConfig(
  apiKey: string,
  resolved: ResolvedModelConfig,
): ModelRunnerConfig {
  return {
    apiKey,
    modelFast: resolved.modelFast,
    modelQuality: resolved.modelQuality,
    modelFollowup: resolved.modelFollowup,
    modelFallback: resolved.modelFallback,
    timeoutMs: resolved.timeoutMs,
  };
}
