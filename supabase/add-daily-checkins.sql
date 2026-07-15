-- Persists the explicit end-of-day confirmation for each participant.
create table if not exists public.daily_checkins (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 75),
  submitted_at timestamptz not null default now(),
  primary key(challenge_id,user_id,day_number)
);
alter table public.daily_checkins enable row level security;
drop policy if exists "members view checkins" on public.daily_checkins;
create policy "members view checkins" on public.daily_checkins for select to authenticated
using (public.is_challenge_member(challenge_id));
drop policy if exists "users submit own checkin" on public.daily_checkins;
create policy "users submit own checkin" on public.daily_checkins for insert to authenticated
with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));

update public.task_templates set label='General 45-minute workout' where task_key='workout-1';
