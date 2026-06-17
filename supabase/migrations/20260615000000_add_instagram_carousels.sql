-- Instagram carousel drafts and publish history.
create table if not exists public.instagram_carousels (
  id                 uuid        primary key default gen_random_uuid(),
  title              text        not null default '',
  caption            text        not null default '',
  status             text        not null default 'draft',
  instagram_media_id text,
  permalink          text,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  posted_at          timestamptz
);

alter table public.instagram_carousels
  add column if not exists title text not null default '',
  add column if not exists caption text not null default '',
  add column if not exists status text not null default 'draft',
  add column if not exists instagram_media_id text,
  add column if not exists permalink text,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists posted_at timestamptz;

do $$
begin
  alter table public.instagram_carousels
    add constraint instagram_carousels_status_check
    check (status in ('draft', 'ready', 'posting', 'posted', 'failed', 'archived'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.instagram_carousel_items (
  id                    uuid        primary key default gen_random_uuid(),
  carousel_id           uuid        not null references public.instagram_carousels(id) on delete cascade,
  post_id               uuid        not null references public.posts(id) on delete restrict,
  position              integer     not null,
  storage_path_snapshot text        not null,
  caption_snapshot      text,
  created_at            timestamptz not null default now()
);

alter table public.instagram_carousel_items
  add column if not exists carousel_id uuid references public.instagram_carousels(id) on delete cascade,
  add column if not exists post_id uuid references public.posts(id) on delete restrict,
  add column if not exists position integer,
  add column if not exists storage_path_snapshot text,
  add column if not exists caption_snapshot text;

do $$
begin
  alter table public.instagram_carousel_items
    add constraint instagram_carousel_items_position_check
    check (position between 1 and 5);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists instagram_carousel_items_carousel_position_idx
  on public.instagram_carousel_items (carousel_id, position);

create unique index if not exists instagram_carousel_items_carousel_post_idx
  on public.instagram_carousel_items (carousel_id, post_id);

create index if not exists instagram_carousels_status_created_idx
  on public.instagram_carousels (status, created_at desc);

create index if not exists instagram_carousel_items_post_idx
  on public.instagram_carousel_items (post_id);

create or replace function public.touch_instagram_carousels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_instagram_carousels_updated_at on public.instagram_carousels;
create trigger touch_instagram_carousels_updated_at
before update on public.instagram_carousels
for each row
execute function public.touch_instagram_carousels_updated_at();

alter table public.instagram_carousels enable row level security;
alter table public.instagram_carousel_items enable row level security;

drop policy if exists "Service role select instagram carousels" on public.instagram_carousels;
create policy "Service role select instagram carousels"
on public.instagram_carousels
for select
to service_role
using (true);

drop policy if exists "Service role insert instagram carousels" on public.instagram_carousels;
create policy "Service role insert instagram carousels"
on public.instagram_carousels
for insert
to service_role
with check (true);

drop policy if exists "Service role update instagram carousels" on public.instagram_carousels;
create policy "Service role update instagram carousels"
on public.instagram_carousels
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete instagram carousels" on public.instagram_carousels;
create policy "Service role delete instagram carousels"
on public.instagram_carousels
for delete
to service_role
using (true);

drop policy if exists "Service role select instagram carousel items" on public.instagram_carousel_items;
create policy "Service role select instagram carousel items"
on public.instagram_carousel_items
for select
to service_role
using (true);

drop policy if exists "Service role insert instagram carousel items" on public.instagram_carousel_items;
create policy "Service role insert instagram carousel items"
on public.instagram_carousel_items
for insert
to service_role
with check (true);

drop policy if exists "Service role update instagram carousel items" on public.instagram_carousel_items;
create policy "Service role update instagram carousel items"
on public.instagram_carousel_items
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete instagram carousel items" on public.instagram_carousel_items;
create policy "Service role delete instagram carousel items"
on public.instagram_carousel_items
for delete
to service_role
using (true);
