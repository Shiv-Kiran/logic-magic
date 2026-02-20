export type LatexLintResult = {
  warnings: string[];
};

function countMatches(source: string, pattern: RegExp): number {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

export function lintLatexMarkdown(markdown: string): LatexLintResult {
  const warnings: string[] = [];

  const displayDelimiterCount = countMatches(markdown, /\$\$/g);
  if (displayDelimiterCount % 2 !== 0) {
    warnings.push("Unbalanced $$ display math delimiters.");
  }

  const inlineDelimiterCount = countMatches(markdown, /(^|[^\\])\$/g);
  if (inlineDelimiterCount % 2 !== 0) {
    warnings.push("Unbalanced $ inline math delimiters.");
  }

  const leftBracketCount = countMatches(markdown, /\\\[/g);
  const rightBracketCount = countMatches(markdown, /\\\]/g);
  if (leftBracketCount !== rightBracketCount) {
    warnings.push("Unbalanced \\[ and \\] delimiters.");
  }

  if (markdown.includes("\\begin{tikzpicture}")) {
    warnings.push("KaTeX does not support TikZ environments.");
  }

  if (markdown.includes("\\begin{lstlisting}")) {
    warnings.push("KaTeX does not support lstlisting environments.");
  }

  return { warnings };
}

