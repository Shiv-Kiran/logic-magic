# MagicLogic

MagicLogic is a logic IDE for turning natural-language proofs into a structured output with three sections:

- Plan (strategy)
- Proof (formal draft)
- Audit (strict critique)

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required keys:

- `OPENAI_API_KEY`
- `OPENAI_MODEL_PRIMARY` (default `gpt-5`)
- `OPENAI_MODEL_FALLBACK` (default `gpt-4.1`)
- `OPENAI_TIMEOUT_MS` (default `30000`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Pipeline

`POST /api/proof/generate` runs:

1. Planner
2. Writer
3. Critic (up to 3 attempts)
4. Final renderer payload

The endpoint streams newline-delimited JSON events (`application/x-ndjson`).

## Supabase persistence

- Successful finals (`PASS` or `PASSED_WITH_WARNINGS`) are saved to `public.proofs`.
- Terminal `FAIL` outputs are returned to the user but not persisted.
- SQL migration is located at `supabase/migrations/202602180001_create_proofs.sql`.

## Quality checks

```bash
npm run lint
npm run build
```
