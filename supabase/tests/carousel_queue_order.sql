-- Rollback-only checks; never invokes the Instagram API.
begin;
do $$
declare draft_id uuid; first_id uuid; second_id uuid; first_time timestamptz; result uuid[];
begin
 insert into instagram_carousels(title,created_at) values('old draft',now()-interval '1 year') returning id into draft_id;
 insert into instagram_carousels(title,status) values('first','ready') returning id,queued_at into first_id,first_time;
 insert into instagram_carousels(title,status) values('second','ready') returning id into second_id;
 update instagram_carousels set status='ready' where id=draft_id;
 update instagram_carousels set caption='edited' where id=first_id;
 if (select queued_at from instagram_carousels where id=first_id)<>first_time then raise exception 'Editing moved the queue entry';end if;
 select array_agg(id order by queued_at,created_at,id) into result from instagram_carousels where id in (draft_id,first_id,second_id);
 if result<>array[first_id,second_id,draft_id] then raise exception 'New ready entries did not append';end if;
 update instagram_carousels set status='draft' where id=first_id;
 update instagram_carousels set status='ready' where id=first_id;
 select array_agg(id order by queued_at,created_at,id) into result from instagram_carousels where id in (draft_id,first_id,second_id);
 if result<>array[second_id,draft_id,first_id] then raise exception 'Requeued entry did not append';end if;
end $$;
rollback;
