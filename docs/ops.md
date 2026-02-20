# Operations Notes

## Runtime Expectations

- Endpoint: `POST /api/proof/generate`
- Response mode: NDJSON streaming (`application/x-ndjson`)
- Default timeout per model call: `OPENAI_TIMEOUT_MS` (fallback 30s)

## Fallback Rules

- Primary model runs first (`OPENAI_MODEL_PRIMARY`).
- If call fails, pipeline retries that step on `OPENAI_MODEL_FALLBACK`.
- If both models fail in a step, pipeline returns an `error` event.

## Persistence Rules

- Insert into `public.proofs` only when final audit status is `PASS` or `PASSED_WITH_WARNINGS`.
- If Supabase is unavailable/misconfigured, proof still returns to user and stream logs a status warning.

## Debug Checklist

1. Confirm `.env.local` values exist and are non-empty.
2. Run `npm run lint && npm run test && npm run build`.
3. Verify network stream contains ordered `status -> ... -> final` events.
4. Verify failed 3-attempt sessions do not create a DB row.
