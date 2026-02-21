import { MathScopeResult } from "@/lib/logic/types";

type AssessMathScopeArgs = {
  problem: string;
  attempt?: string;
  classifyAmbiguous?: (args: { problem: string; attempt?: string }) => Promise<MathScopeResult>;
};

const mathKeywordPatterns = [
  /\bprove\b/,
  /\bproof\b/,
  /\bshow that\b/,
  /\btheorem\b/,
  /\blemma\b/,
  /\bcorollary\b/,
  /\binduction\b/,
  /\bcontradiction\b/,
  /\binvariant\b/,
  /\bgraph\b/,
  /\bdijkstra\b/,
  /\bshortest path\b/,
  /\bcombinatorics\b/,
  /\bprobability\b/,
  /\bnumber theory\b/,
  /\birrational\b/,
  /\bsqrt\b/,
  /\bmod\b/,
  /\binteger\b/,
  /\bderivative\b/,
  /\bintegral\b/,
  /\blimit\b/,
  /\bmatrix\b/,
  /\bcomplexity\b/,
  /\bbig[\s-]?o\b/,
  /\\(frac|sqrt|sum|prod|int|forall|exists)/,
  /[∀∃∑∫√]/,
];

const nonMathKeywordPatterns = [
  /\bpoem\b/,
  /\bstory\b/,
  /\bnovel\b/,
  /\blyrics?\b/,
  /\bmarketing\b/,
  /\bad copy\b/,
  /\bemail\b/,
  /\bresume\b/,
  /\bcover letter\b/,
  /\btravel itinerary\b/,
  /\brecipe\b/,
  /\bhoroscope\b/,
  /\bmovie script\b/,
  /\bsocial media\b/,
  /\binstagram\b/,
  /\btweet\b/,
  /\btranslation\b/,
  /\btranslate\b/,
  /\bstartup pitch\b/,
  /\bbusiness plan\b/,
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function hasEquationSignals(text: string): boolean {
  return (
    /[=<>+\-*/^]/.test(text) ||
    /\b\d+\b/.test(text) ||
    /(\$\$?.+\$\$?)/.test(text) ||
    /\bO\([^)]*\)/.test(text)
  );
}

function heuristicAssess(problem: string, attempt?: string): MathScopeResult {
  const combined = `${problem}\n${attempt ?? ""}`.toLowerCase();
  const mathHits = countMatches(combined, mathKeywordPatterns);
  const nonMathHits = countMatches(combined, nonMathKeywordPatterns);
  const equationHint = hasEquationSignals(combined) ? 1 : 0;
  const effectiveMathScore = mathHits + equationHint;

  if (nonMathHits >= 2 && effectiveMathScore <= 1) {
    return {
      verdict: "BLOCK",
      confidence: 0.92,
      reason: "The request appears non-mathematical and outside proof scope.",
      suggestion: "Ask for a theorem/proof, derivation, or algorithm-correctness claim.",
    };
  }

  if (effectiveMathScore >= 3 && nonMathHits === 0) {
    return {
      verdict: "ALLOW",
      confidence: Math.min(0.99, 0.72 + effectiveMathScore * 0.05),
      reason: "Detected clear mathematics/proof intent.",
      suggestion: "Proceed with structured plan, proof, and audit.",
    };
  }

  if (effectiveMathScore >= 2 && nonMathHits <= 1) {
    return {
      verdict: "ALLOW",
      confidence: 0.74,
      reason: "Likely mathematical request with moderate certainty.",
      suggestion: "Proceed and let planner infer formal structure.",
    };
  }

  return {
    verdict: "REVIEW",
    confidence: 0.5,
    reason: "Prompt is ambiguous about whether it is a math-proof request.",
    suggestion: "Clarify the claim, theorem, or equation to prove.",
  };
}

function normalizeModelScopeResult(result: MathScopeResult): MathScopeResult {
  const confidence = Number.isFinite(result.confidence)
    ? Math.max(0, Math.min(1, result.confidence))
    : 0.5;

  return {
    verdict: result.verdict,
    confidence,
    reason: result.reason.trim() || "Scope classifier provided no reason.",
    suggestion: result.suggestion.trim() || "Please restate as a math proof request.",
  };
}

export async function assessMathScope(args: AssessMathScopeArgs): Promise<MathScopeResult> {
  const heuristic = heuristicAssess(args.problem, args.attempt);

  if (heuristic.verdict !== "REVIEW" || !args.classifyAmbiguous) {
    return heuristic;
  }

  try {
    const modelVerdict = normalizeModelScopeResult(
      await args.classifyAmbiguous({
        problem: args.problem,
        attempt: args.attempt,
      }),
    );

    if (modelVerdict.verdict === "BLOCK" && modelVerdict.confidence >= 0.75) {
      return modelVerdict;
    }

    if (modelVerdict.verdict === "ALLOW" && modelVerdict.confidence >= 0.6) {
      return modelVerdict;
    }

    return {
      verdict: "REVIEW",
      confidence: Math.max(heuristic.confidence, modelVerdict.confidence),
      reason: modelVerdict.reason,
      suggestion: modelVerdict.suggestion,
    };
  } catch {
    return heuristic;
  }
}
