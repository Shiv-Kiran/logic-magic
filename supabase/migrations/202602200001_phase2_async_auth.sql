create extension if not exists pgcrypto;

alter table if exists public.proofs
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists run_id uuid,
  add column if not exists proof_mode text not null default 'MATH_FORMAL',
  add column if not exists variant_role text not null default 'FAST_PRIMARY';

alter table if exists public.proofs
  drop constraint if exists proofs_proof_mode_check;

alter table if exists public.proofs
  add constraint proofs_proof_mode_check check (proof_mode in ('MATH_FORMAL', 'EXPLANATORY'));

alter table if exists public.proofs
  drop constraint if exists proofs_variant_role_check;

alter table if exists public.proofs
  add constraint proofs_variant_role_check check (variant_role in ('FAST_PRIMARY', 'BACKGROUND_QUALITY'));

create index if not exists proofs_user_id_idx on public.proofs (user_id);
create index if not exists proofs_run_id_idx on public.proofs (run_id);
create index if not exists proofs_proof_mode_idx on public.proofs (proof_mode);
create index if not exists proofs_user_created_idx on public.proofs (user_id, created_at desc);

create table if not exists public.proof_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid null references auth.users(id),
  job_type text not null,
  payload_json jsonb not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proof_jobs_status_scheduled_idx on public.proof_jobs (status, scheduled_at);
create index if not exists proof_jobs_run_id_idx on public.proof_jobs (run_id);
create index if not exists proof_jobs_user_created_idx on public.proof_jobs (user_id, created_at desc);

alter table public.proofs enable row level security;
alter table public.proof_jobs enable row level security;

drop policy if exists proofs_select_own on public.proofs;
create policy proofs_select_own on public.proofs
  for select
  using (auth.uid() = user_id);

drop policy if exists proof_jobs_select_own on public.proof_jobs;
create policy proof_jobs_select_own on public.proof_jobs
  for select
  using (auth.uid() = user_id);

