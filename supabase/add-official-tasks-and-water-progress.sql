-- Adds the official 75 Hard checklist model and persisted water progress.
-- Safe to run on the existing database.
alter table public.daily_task_status
add column if not exists progress_value numeric not null default 0;

insert into public.task_templates(challenge_id,task_key,label,position)
select id,'diet','Follow your diet',1 from public.challenges
on conflict(challenge_id,task_key) do update set label=excluded.label,position=excluded.position;

update public.task_templates set label='General 45-minute workout',position=2 where task_key='workout-1';
update public.task_templates set label='45-minute outdoor workout',position=3 where task_key='outdoor-workout';
update public.task_templates set label='One gallon of water',position=4 where task_key='water';
update public.task_templates set label='Read 10 pages of nonfiction',position=5 where task_key='read';
update public.task_templates set label='Take a progress photo',position=6 where task_key='progress-photo';
delete from public.daily_task_status where task_key='follow-plan';
delete from public.task_templates where task_key='follow-plan';
