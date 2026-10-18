-- Private state for ephemeral cloud runners. No client policies.
create table public.instagram_worker_state (
 id text primary key check(id='dailyglance'),
 session jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.instagram_worker_state enable row level security;
revoke all on public.instagram_worker_state from public,anon,authenticated;
grant select,insert,update on public.instagram_worker_state to service_role;
