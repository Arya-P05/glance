-- Drafts: generated posters awaiting review before publishing
create table if not exists public.drafts (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null unique,
  storage_path text        not null,
  caption      jsonb,
  scene        jsonb,
  image_prompt text,
  metadata     jsonb       not null default '{}'::jsonb,
  raw_storage_path text,
  image_model  text,
  caption_model text,
  prompt_model text,
  status       text        not null default 'draft',
  created_at   timestamptz not null default now()
);

alter table public.drafts
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists raw_storage_path text;

create index if not exists drafts_status_created_idx on public.drafts (status, created_at);
create index if not exists drafts_name_idx           on public.drafts (name);

alter table public.drafts enable row level security;

-- Prompts: saved scene/image prompt pairs for reuse
create table if not exists public.prompts (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null unique,
  scene        jsonb,
  image_prompt text,
  prompt_model text,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.prompts
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists prompts_created_idx on public.prompts (created_at);

alter table public.prompts enable row level security;

-- Keep dashboard/API writes service-role-only while allowing reads only through
-- the local backend that uses the service role key.
drop policy if exists "Service role select drafts" on public.drafts;
create policy "Service role select drafts"
on public.drafts
for select
to service_role
using (true);

drop policy if exists "Service role insert drafts" on public.drafts;
create policy "Service role insert drafts"
on public.drafts
for insert
to service_role
with check (true);

drop policy if exists "Service role update drafts" on public.drafts;
create policy "Service role update drafts"
on public.drafts
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete drafts" on public.drafts;
create policy "Service role delete drafts"
on public.drafts
for delete
to service_role
using (true);

drop policy if exists "Service role select prompts" on public.prompts;
create policy "Service role select prompts"
on public.prompts
for select
to service_role
using (true);

drop policy if exists "Service role insert prompts" on public.prompts;
create policy "Service role insert prompts"
on public.prompts
for insert
to service_role
with check (true);

drop policy if exists "Service role update prompts" on public.prompts;
create policy "Service role update prompts"
on public.prompts
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete prompts" on public.prompts;
create policy "Service role delete prompts"
on public.prompts
for delete
to service_role
using (true);
