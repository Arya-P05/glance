-- Separate human decisions for images, wording, and layout. No inferred negatives.
create table if not exists public.generation_feedback (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  stage text not null check (stage in ('background','caption','placement')),
  decision text not null check (decision in ('accepted','rejected','edited','unchanged')),
  reason text not null default '',
  before_value jsonb,
  after_value jsonb,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.generation_feedback add column if not exists sequence bigint generated always as identity;
alter table public.generation_feedback enable row level security;
revoke all on public.generation_feedback from anon, authenticated;
grant all on public.generation_feedback to service_role;
grant usage, select on sequence public.generation_feedback_sequence_seq to service_role;
create index if not exists generation_feedback_source_idx on public.generation_feedback(source_id,stage,created_at desc);

-- The feedback insert shares the transaction with the background update.
create or replace function public.capture_generation_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare event jsonb;
begin
  if new.metadata->'reviewFeedback' is distinct from old.metadata->'reviewFeedback' then
    for event in select value from jsonb_array_elements(coalesce(new.metadata->'reviewFeedback','[]'::jsonb)) loop
      insert into public.generation_feedback(id,source_id,stage,decision,reason,before_value,after_value,context)
      values(coalesce((event->>'eventId')::uuid,gen_random_uuid()),new.id,event->>'stage',event->>'decision',coalesce(event->>'reason',''),event->'before',event->'after',
        jsonb_build_object('name',new.name,'storagePath',new.storage_path,'scene',new.scene,
          'generationTasteHash',new.metadata#>>'{generationTaste,hash}',
          'captionTasteHash',new.metadata#>>'{captionTaste,hash}',
          'reviewBatchId',new.metadata->>'reviewBatchId')) on conflict(id) do nothing;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.capture_generation_feedback() from public;
drop trigger if exists capture_generation_feedback on public.backgrounds;
create trigger capture_generation_feedback after update of metadata on public.backgrounds
for each row execute function public.capture_generation_feedback();

-- Lock and check the exact caption revision before rejecting; keep the background staged.
create or replace function public.reject_background_caption(
  background_name text, option_index integer, expected_caption jsonb, feedback_reason text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.backgrounds; original jsonb; next_metadata jsonb;
begin
  if length(feedback_reason)>1000 then raise exception 'Feedback is too long'; end if;
  select * into item from public.backgrounds where name=background_name and status='staged' for update;
  if not found then raise exception 'Staged background not found'; end if;
  original := item.metadata->'captionOptions'->option_index;
  if option_index < 0 or original is null or original is distinct from expected_caption then
    raise exception 'Caption changed; refresh before reviewing';
  end if;
  -- Repeated clicks do not create duplicate rejection events.
  if coalesce(item.metadata->'captionRejections','[]'::jsonb) @> jsonb_build_array(original) then
    return item.metadata;
  end if;
  next_metadata := coalesce(item.metadata,'{}'::jsonb) || jsonb_build_object(
    'captionRejections',coalesce(item.metadata->'captionRejections','[]'::jsonb) || jsonb_build_array(original),
    'reviewFeedback',jsonb_build_array(jsonb_build_object('eventId',gen_random_uuid(),'stage','caption','decision','rejected',
      'reason',feedback_reason,'before',jsonb_build_object('caption',original,'optionIndex',option_index),'after',null)));
  update public.backgrounds set metadata=next_metadata where id=item.id;
  return next_metadata;
end $$;
revoke all on function public.reject_background_caption(text,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.reject_background_caption(text,integer,jsonb,text) to service_role;

-- A slow generation job must not overwrite feedback submitted while it runs.
create or replace function public.merge_background_generation(target_id uuid, patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  update public.backgrounds set metadata=coalesce(metadata,'{}'::jsonb) || (patch - 'reviewFeedback' - 'captionRejections')
    where id=target_id and status='staged' returning metadata into result;
  if not found then raise exception 'Background is no longer awaiting caption review'; end if;
  return result;
end $$;
revoke all on function public.merge_background_generation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.merge_background_generation(uuid,jsonb) to service_role;

-- Draft, selected wording, final layout, and feedback commit together.
create or replace function public.complete_background_review(
  target_id uuid, final_caption jsonb, final_metadata jsonb, final_path text,
  option_index integer, expected_caption jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare item public.backgrounds; draft_id uuid;
begin
  select * into item from public.backgrounds where id=target_id and status='staged' for update;
  if not found then raise exception 'Background is no longer awaiting review'; end if;
  if expected_caption is not null and item.metadata->'captionOptions'->option_index is distinct from expected_caption then
    raise exception 'Caption changed; refresh before reviewing';
  end if;
  final_metadata := final_metadata || jsonb_build_object('captionRejections',coalesce(item.metadata->'captionRejections','[]'::jsonb));
  insert into public.drafts(name,storage_path,caption,scene,image_prompt,raw_storage_path,image_model,prompt_model,caption_model,metadata,status)
    values(item.name,final_path,final_caption,coalesce(item.scene,final_metadata->'scene'),coalesce(item.image_prompt,final_metadata->>'scenePrompt'),item.storage_path,item.image_model,item.prompt_model,
      final_metadata->>'captionModel',final_metadata,'draft')
    on conflict(name) do update set storage_path=excluded.storage_path,caption=excluded.caption,scene=excluded.scene,
      image_prompt=excluded.image_prompt,raw_storage_path=excluded.raw_storage_path,image_model=excluded.image_model,
      prompt_model=excluded.prompt_model,caption_model=excluded.caption_model,metadata=excluded.metadata,status='draft'
    returning id into draft_id;
  insert into public.caption_options(background_id,draft_id,caption,caption_model,prompt,metadata,status)
    values(item.id,draft_id,final_caption,final_metadata->>'captionModel',final_metadata->>'captionPrompt',
      jsonb_build_object('optionIndex',option_index,'selectedCaptionIndex',option_index,'scene',final_metadata->'scene','mediumStoragePath',final_metadata->'mediumStoragePath','captionLayout',final_metadata->'captionLayout','mediumCaptionLayout',final_metadata->'mediumCaptionLayout'),'selected');
  update public.backgrounds set status='approved',approved_draft_name=item.name,approved_at=now(),metadata=final_metadata where id=item.id;
  return draft_id;
end $$;
revoke all on function public.complete_background_review(uuid,jsonb,jsonb,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.complete_background_review(uuid,jsonb,jsonb,text,integer,jsonb) to service_role;
