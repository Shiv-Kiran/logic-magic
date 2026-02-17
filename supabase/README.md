# Supabase Setup

1. Create a Supabase project.
2. Run SQL migration `supabase/migrations/202602180001_create_proofs.sql`.
3. Copy env values to `.env.local`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

MagicLogic writes to `public.proofs` only when final audit status is PASS or PASSED_WITH_WARNINGS.
