type FixedWindowEntry = {
  count: number;
  resetAtMs: number;
};

type RateLimitArgs = {
  namespace: string;
  identifier: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

const GLOBAL_KEY = "__magiclogic_rate_limit_store__";

function getStore(): Map<string, FixedWindowEntry> {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Map<string, FixedWindowEntry>;
  };

  if (!globalScope[GLOBAL_KEY]) {
    globalScope[GLOBAL_KEY] = new Map<string, FixedWindowEntry>();
  }

  return globalScope[GLOBAL_KEY]!;
}

function cleanupExpiredEntries(store: Map<string, FixedWindowEntry>, now: number): void {
  if (store.size < 5000) {
    return;
  }

  for (const [key, value] of store.entries()) {
    if (value.resetAtMs <= now) {
      store.delete(key);
    }
  }
}

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    const ip = first?.trim();
    if (ip) {
      return ip;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) {
    return cfIp;
  }

  return "unknown";
}

export function checkFixedWindowRateLimit(args: RateLimitArgs): RateLimitResult {
  const now = Date.now();
  const windowMs = Math.max(1, args.windowMs);
  const limit = Math.max(1, args.limit);
  const key = `${args.namespace}:${args.identifier}`;
  const store = getStore();

  cleanupExpiredEntries(store, now);

  const existing = store.get(key);
  if (!existing || existing.resetAtMs <= now) {
    const resetAtMs = now + windowMs;
    store.set(key, {
      count: 1,
      resetAtMs,
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAtMs,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAtMs: existing.resetAtMs,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAtMs: existing.resetAtMs,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
  };
}
