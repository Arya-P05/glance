-- Run against an isolated DB with migrations applied. Fixtures roll back.
begin;
do $$
declare bg uuid; draft uuid; post uuid; path text; token uuid;
begin
  insert into backgrounds(name,storage_path,scene,metadata,status)
    values('asset-test','drafts/backgrounds/test-original.png','{"subject":"test"}',
      '{"grain":{"originalStoragePath":"drafts/backgrounds/test-original.png"}}','staged') returning id into bg;
  insert into drafts(name,storage_path,raw_storage_path,caption,metadata)
    values('asset-test','drafts/captioned/test-square.png','drafts/backgrounds/test-original.png',
      '{"smallText":"hello","bigText":"world"}','{"mediumStoragePath":"drafts/medium/test-wide.png"}') returning id into draft;
  path := publish_image_draft(draft,'inactive');
  assert path='drafts/captioned/test-square.png', 'publishing must reuse the finished render';
  select id into post from posts where instagram_id='generated_asset-test';
  assert (select status='inactive' and medium_storage_path='drafts/medium/test-wide.png' from posts where id=post);
  assert (select status='published' from drafts where id=draft);
  assert publish_image_draft(draft,'active')=path, 'retry must return same post';
  assert (select status='inactive' from posts where id=post), 'retry must not change a completed decision';
  assert (select count(*)=1 from posts where instagram_id='generated_asset-test');

  delete from posts where id=post;
  update image_assets set lease_until=now()-interval '2 days',unreferenced_at=now()-interval '60 days';
  assert claim_image_cleanup('drafts/captioned/test-square.png',30) is null, 'draft protects shared file';
  update drafts set status='discarded' where id=draft;
  assert claim_image_cleanup('drafts/captioned/test-square.png',30) is null, 'discard remains non-destructive';
  update drafts set storage_path='drafts/captioned/test-edited.png' where id=draft;
  assert claim_image_cleanup('drafts/captioned/test-square.png',30) is null, 'retention starts when last reference leaves';
  update image_assets set unreferenced_at=now()-interval '31 days' where storage_path='drafts/captioned/test-square.png';
  token := claim_image_cleanup('drafts/captioned/test-square.png',30);
  assert token is not null, 'superseded render is collectible';
  assert claim_image_cleanup('drafts/captioned/test-square.png',30) is null, 'another cleaner cannot claim an in-flight deletion';
  begin
    insert into posts(instagram_id,storage_path) values('must-not-reference-deleting', 'drafts/captioned/test-square.png');
    raise exception 'expected unavailable-image rejection';
  exception when raise_exception then
    if SQLERRM='expected unavailable-image rejection' then raise; end if;
  end;
  assert not exists(select 1 from posts where instagram_id='must-not-reference-deleting');
  perform finish_image_cleanup('drafts/captioned/test-square.png',token);
  assert (select state='deleted' from image_assets where storage_path='drafts/captioned/test-square.png');
  perform reserve_image_asset('drafts/captioned/test-square.png','render',null,'test-hash',100);
  assert claim_image_cleanup('drafts/captioned/test-square.png',0) is null, 'upload lease prevents deletion before row commit';
  begin
    perform reserve_image_asset('drafts/captioned/test-square.png','render',null,'different-hash',100);
    raise exception 'expected immutable-path rejection';
  exception when raise_exception then
    if SQLERRM='expected immutable-path rejection' then raise; end if;
  end;

  insert into drafts(name,storage_path,caption,metadata)
    values('asset-square-only','drafts/captioned/only-square.png','{"smallText":"a","bigText":"b"}',
      '{"mediumRejected":true,"mediumStoragePath":"drafts/medium/stale.png"}') returning id into draft;
  perform publish_image_draft(draft);
  assert (select medium_storage_path is null and not medium_eligible from posts where instagram_id='generated_asset-square-only');

  -- A failure inside publication must roll back both membership and draft status.
  insert into drafts(name,storage_path,caption) values('asset-failure','drafts/captioned/fail.png','{"smallText":"fail","bigText":"publish"}') returning id into draft;
  alter table posts add constraint test_publish_failure check (caption <> 'fail publish');
  begin
    perform publish_image_draft(draft);
    raise exception 'expected publication failure';
  exception when check_violation then null;
  end;
  assert (select status='draft' from drafts where id=draft);
  assert not exists(select 1 from posts where instagram_id='generated_asset-failure');
  alter table posts drop constraint test_publish_failure;

  perform merge_image_generation('asset-test','{"captionOptions":[{"smallText":"x","bigText":"y"}]}');
  assert (select metadata#>>'{grain,originalStoragePath}'='drafts/backgrounds/test-original.png' from backgrounds where id=bg);
  assert not has_function_privilege('anon','public.publish_image_draft(uuid,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.claim_image_cleanup(text,integer)','EXECUTE');
end $$;
rollback;
