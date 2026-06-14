-- Backgrounds: image-only generated candidates awaiting caption selection.
create table if not exists public.backgrounds (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null unique,
  storage_path        text        not null,
  scene               jsonb,
  image_prompt        text,
  metadata            jsonb       not null default '{}'::jsonb,
  image_model         text,
  prompt_model        text,
  status              text        not null default 'pending',
  approved_draft_name text,
  approved_at         timestamptz,
  created_at          timestamptz not null default now()
);

alter table public.backgrounds
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists image_model text,
  add column if not exists prompt_model text,
  add column if not exists status text not null default 'pending',
  add column if not exists approved_draft_name text,
  add column if not exists approved_at timestamptz;

do $$
begin
  alter table public.backgrounds
    add constraint backgrounds_status_check
    check (status in ('pending', 'approved', 'discarded'));
exception
  when duplicate_object then null;
end $$;

create index if not exists backgrounds_status_created_idx on public.backgrounds (status, created_at);
create index if not exists backgrounds_name_idx           on public.backgrounds (name);

alter table public.backgrounds enable row level security;

-- Caption options: generated message candidates for one background.
create table if not exists public.caption_options (
  id            uuid        primary key default gen_random_uuid(),
  background_id uuid        references public.backgrounds(id) on delete cascade,
  draft_id      uuid        references public.drafts(id) on delete set null,
  caption       jsonb       not null,
  caption_model text,
  prompt        text,
  metadata      jsonb       not null default '{}'::jsonb,
  status        text        not null default 'candidate',
  created_at    timestamptz not null default now()
);

alter table public.caption_options
  add column if not exists draft_id uuid references public.drafts(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'candidate';

do $$
begin
  alter table public.caption_options
    add constraint caption_options_status_check
    check (status in ('candidate', 'selected', 'rejected'));
exception
  when duplicate_object then null;
end $$;

create index if not exists caption_options_background_created_idx on public.caption_options (background_id, created_at);
create index if not exists caption_options_status_created_idx     on public.caption_options (status, created_at);

alter table public.caption_options enable row level security;

-- Move legacy image-only draft rows into the new background pipeline without
-- deleting the old rows. The API now hides those legacy rows from draft review.
insert into public.backgrounds (
  name,
  storage_path,
  scene,
  image_prompt,
  metadata,
  image_model,
  prompt_model,
  status,
  created_at
)
select
  name,
  coalesce(raw_storage_path, storage_path),
  scene,
  image_prompt,
  metadata,
  image_model,
  prompt_model,
  'pending',
  created_at
from public.drafts
where status = 'draft'
  and (
    caption is null
    or not (caption ? 'smallText')
    or not (caption ? 'bigText')
    or nullif(caption->>'smallText', '') is null
    or nullif(caption->>'bigText', '') is null
  )
on conflict (name) do nothing;

drop policy if exists "Service role select backgrounds" on public.backgrounds;
create policy "Service role select backgrounds"
on public.backgrounds
for select
to service_role
using (true);

drop policy if exists "Service role insert backgrounds" on public.backgrounds;
create policy "Service role insert backgrounds"
on public.backgrounds
for insert
to service_role
with check (true);

drop policy if exists "Service role update backgrounds" on public.backgrounds;
create policy "Service role update backgrounds"
on public.backgrounds
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete backgrounds" on public.backgrounds;
create policy "Service role delete backgrounds"
on public.backgrounds
for delete
to service_role
using (true);

drop policy if exists "Service role select caption options" on public.caption_options;
create policy "Service role select caption options"
on public.caption_options
for select
to service_role
using (true);

drop policy if exists "Service role insert caption options" on public.caption_options;
create policy "Service role insert caption options"
on public.caption_options
for insert
to service_role
with check (true);

drop policy if exists "Service role update caption options" on public.caption_options;
create policy "Service role update caption options"
on public.caption_options
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete caption options" on public.caption_options;
create policy "Service role delete caption options"
on public.caption_options
for delete
to service_role
using (true);
