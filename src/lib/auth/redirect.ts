export function resolveSafeNextPath(rawNext: string | null): string {
  if (!rawNext) {
    return "/";
  }

  const normalized = rawNext.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/";
  }

  return normalized;
}

export function buildLoginRedirect(nextPath: string): string {
  const safeNext = resolveSafeNextPath(nextPath);
  return `/login?next=${encodeURIComponent(safeNext)}`;
}
