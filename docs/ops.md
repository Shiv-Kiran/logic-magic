# Operations Notes

## Runtime Expectations

- Endpoint: `POST /api/proof/generate`
- Endpoint: `POST /api/proof/followup`
- Endpoint: `GET /api/proof/history/[runId]`
- Response mode: NDJSON streaming (`application/x-ndjson`)
- Default timeout per model call: `OPENAI_TIMEOUT_MS` (fallback 20s)
- Fast-first model policy:
  - Fast path uses `OPENAI_MODEL_FAST` (default `gpt-4.1`)
  - Background quality path uses `OPENAI_MODEL_QUALITY` (default `gpt-5`)
  - Follow-up path uses `OPENAI_MODEL_FOLLOWUP` (default `gpt-4.1`)
  - Per-step fallback uses `OPENAI_MODEL_FALLBACK`
- Models are sourced from env config; `OPENAI_MODEL_FAST` is required.

## Fallback Rules

- Selected tier model runs first (`OPENAI_MODEL_FAST` or `OPENAI_MODEL_QUALITY`).
- If a step fails, that step retries on `OPENAI_MODEL_FALLBACK`.
- If both models fail in a step, pipeline returns an `error` event.

## Persistence Rules

- Fast variant is persisted when Supabase is configured.
- Background jobs are written to `public.proof_jobs` and processed by `POST /api/internal/jobs/process`.
- Background jobs are also dispatched asynchronously from `POST /api/proof/generate` using server `after(...)`.
- If Supabase is unavailable/misconfigured, generation still returns; background queue/history are skipped.
- History APIs are authenticated and user-scoped (`/api/proof/history`, `/api/proof/history/[runId]`).
- Follow-up API allows anonymous free-form questions, but run-bound context requires ownership checks.
- Anonymous follow-up policy:
  - `FOLLOWUP_FREE_LIMIT` (default 2) within `FOLLOWUP_FREE_WINDOW_MINUTES` (default 1440).
  - After free quota is exhausted, API returns login-required error.
  - Additional burst limits are enforced with IP/user windows.
- Anonymous generate policy:
  - `GENERATE_ANON_LIMIT` (default 6) within `GENERATE_ANON_WINDOW_MINUTES` (default 60).

## Debug Checklist

1. Confirm `.env.local` values exist and are non-empty.
2. For auth/history, confirm Google provider is enabled in Supabase and callback URL is configured.
3. For internal worker endpoint access, confirm `INTERNAL_CRON_SECRET` (or `CRON_SECRET`) is configured.
4. Run `npm run lint && npm run test && npm run build`.
5. Verify stream order includes `status`, `heartbeat`, `plan`, `draft_delta`, `final_fast`, `background_queued`.
6. Verify queued jobs are picked up asynchronously after generate, or manually via `/api/internal/jobs/process`.
7. Verify signed-in user can open `/history` and `/history/[runId]` and only see their own rows.
8. Verify follow-up returns concise markdown and uses run context only for owned runs.
9. Verify anonymous users can ask 2 follow-ups, then receive sign-in-required response.
