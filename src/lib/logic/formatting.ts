export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}

export function trimToLineCount(text: string, maxLines: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, source) => {
      if (line.length > 0) {
        return true;
      }

      return index > 0 && source[index - 1].length > 0;
    });

  return lines.slice(0, maxLines).join("\n").trim();
}
