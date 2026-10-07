-- Durable concept memory, independent of review status and asset deletion.
create table if not exists public.generation_history (
  name text primary key,
  scene jsonb not null,
  image_prompt text,
  created_at timestamptz not null default now()
);
alter table public.generation_history enable row level security;
revoke all on public.generation_history from anon, authenticated;
grant all on public.generation_history to service_role;
create index if not exists generation_history_recent_idx on public.generation_history(created_at desc, name);

insert into public.generation_history(name,scene,image_prompt,created_at)
select distinct on (name) name, scene, image_prompt, created_at from (
  select name, coalesce(scene,metadata->'scene') scene, image_prompt, created_at, 0 priority from public.backgrounds
  union all
  select name, coalesce(scene,metadata->'scene'), metadata->>'scenePrompt', created_at, 1 priority from public.drafts
) generated
where scene is not null and scene <> 'null'::jsonb
order by name, priority, created_at
on conflict(name) do nothing;

create or replace function public.remember_generated_background() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.scene,new.metadata->'scene') is not null then
    insert into public.generation_history(name,scene,image_prompt,created_at)
    values(new.name,coalesce(new.scene,new.metadata->'scene'),new.image_prompt,new.created_at)
    on conflict(name) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.remember_generated_background() from public;
drop trigger if exists remember_generated_background on public.backgrounds;
create trigger remember_generated_background after insert on public.backgrounds
for each row execute function public.remember_generated_background();
