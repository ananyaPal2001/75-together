-- Allows several photos per participant per challenge day and disables videos.
alter table public.journal_media
drop constraint if exists journal_media_challenge_id_user_id_day_number_key;

update storage.buckets
set allowed_mime_types=array['image/jpeg','image/png','image/webp']
where id='journal-media';
