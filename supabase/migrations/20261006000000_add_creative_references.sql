-- Human-reviewed taste references. Suggestions never imply user approval.
create table if not exists public.creative_references (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('post', 'background')),
  source_id uuid not null,
  storage_path text not null,
  source_caption text,
  title text not null default '',
  role text not null default 'exemplar' check (role in ('exemplar', 'near_miss')),
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected')),
  suggested_by text not null default 'user' check (suggested_by in ('assistant', 'user')),
  rationale text not null default '',
  preserve text not null default '',
  vary text not null default '',
  caution text not null default '',
  tags text[] not null default '{}',
  user_notes text not null default '',
  benchmark boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_reference_unique unique (source_type, source_id),
  constraint benchmark_requires_review check (not benchmark or review_status = 'accepted')
);
alter table public.creative_references enable row level security;
revoke all on public.creative_references from anon, authenticated;
grant all on public.creative_references to service_role;
create index if not exists creative_reference_review_idx on public.creative_references(review_status, created_at);
