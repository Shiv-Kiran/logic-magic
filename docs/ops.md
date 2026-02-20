# Operations Notes

## Runtime Expectations

- Endpoint: `POST /api/proof/generate`
- Response mode: NDJSON streaming (`application/x-ndjson`)
- Default timeout per model call: `OPENAI_TIMEOUT_MS` (fallback 20s)
- Fast-first model policy:
  - Fast path uses `OPENAI_MODEL_FAST` (default `gpt-4.1`)
  - Background quality path uses `OPENAI_MODEL_QUALITY` (default `gpt-5`)
  - Per-step fallback uses `OPENAI_MODEL_FALLBACK`

## Fallback Rules

- Selected tier model runs first (`OPENAI_MODEL_FAST` or `OPENAI_MODEL_QUALITY`).
- If a step fails, that step retries on `OPENAI_MODEL_FALLBACK`.
- If both models fail in a step, pipeline returns an `error` event.

## Persistence Rules

- Fast variant is persisted when Supabase is configured.
- Background jobs are written to `public.proof_jobs` and processed by `POST /api/internal/jobs/process`.
- If Supabase is unavailable/misconfigured, generation still returns; background queue/history are skipped.
- History is authenticated and user-scoped (`/api/proof/history`).

## Debug Checklist

1. Confirm `.env.local` values exist and are non-empty.
2. For auth/history, confirm Google provider is enabled in Supabase and callback URL is configured.
3. For background jobs, confirm cron secret is configured (`INTERNAL_CRON_SECRET` or `CRON_SECRET`).
4. Run `npm run lint && npm run test && npm run build`.
5. Verify stream order includes `status`, `heartbeat`, `plan`, `draft_delta`, `final_fast`, `background_queued`.
6. Verify `/api/internal/jobs/process` marks queued jobs as `PROCESSING` then `COMPLETED` or `FAILED`.
7. Verify signed-in user can open `/history` and only see their own rows.
