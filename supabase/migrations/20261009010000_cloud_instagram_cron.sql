create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Named Vault entries are provisioned out of band; never put tokens in migrations.
create or replace function public.invoke_instagram_scheduler() returns bigint
language plpgsql security definer set search_path=public as $$
declare endpoint text; token text; request_id bigint;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='glance_instagram_project_url' limit 1;
 select decrypted_secret into token from vault.decrypted_secrets where name='glance_instagram_scheduler_secret' limit 1;
 if endpoint is null or token is null then raise exception 'Missing scheduler Vault configuration'; end if;
 select net.http_post(url:=endpoint || '/functions/v1/instagram-scheduler',
   headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-secret',token),body:='{}'::jsonb,timeout_milliseconds:=100000) into request_id;
 return request_id;
end $$;
revoke all on function public.invoke_instagram_scheduler() from public,anon,authenticated;
select cron.schedule('glance-instagram-publisher','* * * * *','select public.invoke_instagram_scheduler();');
