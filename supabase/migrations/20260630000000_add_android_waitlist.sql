create table if not exists public.android_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists android_waitlist_email_normalized_idx
on public.android_waitlist (lower(btrim(email)));

alter table public.android_waitlist enable row level security;

drop policy if exists "Public insert android waitlist" on public.android_waitlist;
create policy "Public insert android waitlist"
on public.android_waitlist
for insert
to anon
with check (
  length(btrim(name)) > 0
  and email = lower(btrim(email))
  and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
);

revoke all on table public.android_waitlist from anon, authenticated;
grant insert on table public.android_waitlist to anon;
