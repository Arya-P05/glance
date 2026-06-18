-- Add the image-approved queue between raw backgrounds and finished drafts.
alter table public.backgrounds
  drop constraint if exists backgrounds_status_check;

alter table public.backgrounds
  add constraint backgrounds_status_check
  check (status in ('pending', 'staged', 'approved', 'discarded'));
