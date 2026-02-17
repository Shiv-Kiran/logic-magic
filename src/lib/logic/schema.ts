import { z } from "zod";
import { ProofStrategy } from "@/lib/logic/types";

export const userIntentSchema = z.enum(["LEARNING", "VERIFICATION"]);

export const auditStatusSchema = z.enum(["PASS", "FAIL", "PASSED_WITH_WARNINGS"]);

export const criticStatusSchema = z.enum(["PASS", "FAIL"]);

export const planStepSchema = z.object({
  type: z.enum(["step", "math"]),
  content: z.string().min(1),
});

export const contradictionSetupSchema = z.object({
  assumption: z.string().min(1),
  implication: z.string().min(1),
  climax: z.string().min(1),
});

export const auditReportSchema = z.object({
  status: auditStatusSchema,
  attempts: z.number().int().min(0),
  critiques: z.array(z.string().min(1)).default([]),
  final_verdict: z.string().min(1),
});

export const planJsonSchema = z.object({
  meta: z.object({
    strategy: z.nativeEnum(ProofStrategy),
    confidence_score: z.number().min(0).max(1),
    user_intent: userIntentSchema,
  }),
  setup: z.object({
    definitions: z.array(z.string().min(1)).default([]),
    assumptions: z.array(z.string().min(1)).default([]),
    goal: z.string().min(1),
  }),
  core_logic: z
    .object({
      invariant: z.string().min(1).optional(),
      base_cases: z.array(z.string().min(1)).optional(),
      contradiction_setup: contradictionSetupSchema.optional(),
    })
    .catchall(z.unknown()),
  steps: z.array(planStepSchema).min(1),
  audit_report: auditReportSchema,
});

export const criticResultSchema = z.object({
  status: criticStatusSchema,
  gaps: z.array(z.string().min(1)).default([]),
  final_verdict: z.string().min(1),
});

export const writerDraftSchema = z.object({
  markdown: z.string().min(1),
});

export const generateProofRequestSchema = z.object({
  problem: z.string().trim().min(1),
  attempt: z.string().trim().optional(),
  userIntent: userIntentSchema,
});
