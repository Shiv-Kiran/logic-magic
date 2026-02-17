# MagicLogic

MagicLogic is a logic IDE for turning natural-language proofs into a structured output with three sections:

- Plan (strategy)
- Proof (formal draft)
- Audit (strict critique)

## Current status

This repository is in active MVP development.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy from `.env.example`:

```bash
cp .env.example .env.local
```

Required keys:

- `OPENAI_API_KEY`
- `OPENAI_MODEL_PRIMARY`
- `OPENAI_MODEL_FALLBACK`
- `OPENAI_TIMEOUT_MS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
