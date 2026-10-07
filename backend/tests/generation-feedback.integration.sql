-- Run after the feedback migration. Every fixture and decision is rolled back.
begin;
do $$
declare source uuid; name text := 'feedback_test_' || gen_random_uuid(); accepted_id uuid := gen_random_uuid();
  cap jsonb := '{"smallText":"keep going","bigText":"small steps count"}';
  meta jsonb; final_meta jsonb; result uuid; count_events integer;
begin
  insert into public.backgrounds(name,storage_path,status,scene,metadata)
    values(name,'tests/not-a-real-image.png','pending','{"subject":"test fixture"}',jsonb_build_object('captionOptions',jsonb_build_array(cap,cap || '{"bigText":"another option"}'))) returning id into source;
  update public.backgrounds set status='staged',metadata=metadata || jsonb_build_object('reviewFeedback',jsonb_build_array(jsonb_build_object('eventId',accepted_id,'stage','background','decision','accepted','reason','test')))
    where id=source;
  perform public.reject_background_caption(name,0,cap,'too generic');
  perform public.reject_background_caption(name,0,cap,'too generic');
  select count(*) into count_events from public.generation_feedback where source_id=source;
  if count_events<>2 then raise exception 'Expected acceptance plus one rejection, got %',count_events;end if;
  if (select status from public.backgrounds where id=source)<>'staged' then raise exception 'Rejecting text changed background status';end if;
  meta:=public.merge_background_generation(source,jsonb_build_object('captionOptions',jsonb_build_array(cap),'captionRejections','[]'::jsonb,'reviewFeedback','[]'::jsonb));
  if jsonb_array_length(meta->'captionRejections')<>1 then raise exception 'Generation erased rejection';end if;
  if (select count(*) from public.generation_feedback where source_id=source)<>2 then raise exception 'Generation created inferred feedback';end if;
  begin
    perform public.reject_background_caption(name,0,'{"smallText":"stale","bigText":"caption"}','');
    raise exception 'STALE_CAPTION_ACCEPTED';
  exception when others then
    if sqlerrm='STALE_CAPTION_ACCEPTED' then raise;end if;
  end;
  final_meta:=meta || jsonb_build_object('caption',cap,'captionModel','test','reviewFeedback',jsonb_build_array(
    jsonb_build_object('eventId',gen_random_uuid(),'stage','caption','decision','accepted','before',jsonb_build_object('caption',cap),'after',jsonb_build_object('caption',cap)),
    jsonb_build_object('eventId',gen_random_uuid(),'stage','placement','decision','unchanged','before','{}'::jsonb,'after','{}'::jsonb)));
  result:=public.complete_background_review(source,cap,final_meta,'tests/not-a-real-draft.png',0,cap);
  if (select status from public.backgrounds where id=source)<>'approved' or result is null then raise exception 'Final review failed';end if;
  if (select count(*) from public.generation_feedback where source_id=source)<>4 then raise exception 'Final approval did not capture exactly two decisions';end if;
  -- Retry cannot create another draft or another decision.
  begin
    perform public.complete_background_review(source,cap,final_meta,'tests/duplicate.png',0,cap);
    raise exception 'DUPLICATE_APPROVAL_ACCEPTED';
  exception when others then
    if sqlerrm='DUPLICATE_APPROVAL_ACCEPTED' then raise;end if;
  end;
  if (select count(*) from public.generation_feedback where source_id=source)<>4 then raise exception 'Retry duplicated feedback';end if;
end $$;
rollback;
