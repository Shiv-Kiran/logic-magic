create extension if not exists pgcrypto;

create table if not exists public.proofs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  problem text not null,
  attempt text null,
  user_intent text not null check (user_intent in ('LEARNING', 'VERIFICATION')),
  strategy text not null,
  confidence_score numeric null,
  plan_json jsonb not null,
  proof_markdown text not null,
  audit_status text not null,
  audit_report jsonb not null,
  attempt_count int not null,
  model_primary text not null,
  model_fallback text null,
  models_used jsonb not null,
  latency_ms int not null
);

create index if not exists proofs_created_at_idx on public.proofs (created_at desc);
create index if not exists proofs_strategy_idx on public.proofs (strategy);
