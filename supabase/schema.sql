-- Run this file once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique,
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  constraint valid_75_day_window check (end_date = start_date + 74)
);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','partner')),
  status text not null default 'accepted' check (status in ('invited','accepted')),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.task_templates (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  task_key text not null,
  label text not null,
  position smallint not null,
  primary key (challenge_id, task_key)
);

create table if not exists public.daily_task_status (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 75),
  task_key text not null,
  is_complete boolean not null default false,
  progress_value numeric not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id, day_number, task_key),
  foreign key (challenge_id, task_key) references public.task_templates(challenge_id, task_key) on delete cascade
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 75),
  body text not null default '' check (char_length(body) <= 10000),
  mood smallint check (mood between 1 and 5),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint journal_media_image_only check (media_type like 'image/%')
);

create table if not exists public.daily_checkins (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 75),
  submitted_at timestamptz not null default now(),
  primary key(challenge_id,user_id,day_number)
);

create table if not exists public.journal_media (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 75),
  storage_path text not null unique,
  media_type text not null,
  file_size bigint not null check (file_size <= 52428800),
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id, day_number)
);

create or replace function public.is_challenge_member(target_challenge uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from challenge_members where challenge_id = target_challenge and user_id = auth.uid() and status = 'accepted') $$;

create or replace function public.create_challenge(challenge_name text, challenge_start date)
returns public.challenges language plpgsql security definer set search_path = public
as $$
declare created public.challenges; code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  loop
    code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists(select 1 from challenges where invite_code = code);
  end loop;
  insert into challenges(owner_id,name,invite_code,start_date,end_date)
  values(auth.uid(),challenge_name,code,challenge_start,challenge_start + 74) returning * into created;
  insert into challenge_members(challenge_id,user_id,role) values(created.id,auth.uid(),'owner');
  insert into task_templates(challenge_id,task_key,label,position) values
    (created.id,'diet','Follow your diet',1),(created.id,'workout-1','General 45-minute workout',2),
    (created.id,'outdoor-workout','45-minute outdoor workout',3),(created.id,'water','One gallon of water',4),
    (created.id,'read','Read 10 pages of nonfiction',5),(created.id,'progress-photo','Take a progress photo',6);
  return created;
end $$;

create or replace function public.join_challenge(supplied_code text)
returns public.challenges language plpgsql security definer set search_path = public
as $$
declare selected public.challenges; member_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into selected from challenges where invite_code = upper(trim(supplied_code));
  if selected.id is null then raise exception 'Invitation code not found'; end if;
  select count(*) into member_count from challenge_members where challenge_id = selected.id and status = 'accepted';
  if member_count >= 2 then raise exception 'This challenge already has two members'; end if;
  insert into challenge_members(challenge_id,user_id,role,status)
  values(selected.id,auth.uid(),'partner','accepted') on conflict do nothing;
  return selected;
end $$;

alter table profiles enable row level security;
alter table challenges enable row level security;
alter table challenge_members enable row level security;
alter table task_templates enable row level security;
alter table daily_task_status enable row level security;
alter table journal_entries enable row level security;
alter table daily_checkins enable row level security;
alter table journal_media enable row level security;

create policy "profiles visible to signed users" on profiles for select to authenticated using (true);
create policy "users update own profile" on profiles for all to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "members view challenge" on challenges for select to authenticated using (is_challenge_member(id));
create policy "owner updates challenge" on challenges for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "members view membership" on challenge_members for select to authenticated using (is_challenge_member(challenge_id));
create policy "members view tasks" on task_templates for select to authenticated using (is_challenge_member(challenge_id));
create policy "members view task status" on daily_task_status for select to authenticated using (is_challenge_member(challenge_id));
create policy "users write own task status" on daily_task_status for all to authenticated using (user_id=auth.uid() and is_challenge_member(challenge_id)) with check (user_id=auth.uid() and is_challenge_member(challenge_id));
create policy "members view journals" on journal_entries for select to authenticated using (is_challenge_member(challenge_id));
create policy "users write own journal" on journal_entries for all to authenticated using (user_id=auth.uid() and is_challenge_member(challenge_id)) with check (user_id=auth.uid() and is_challenge_member(challenge_id));
create policy "members view checkins" on daily_checkins for select to authenticated using (is_challenge_member(challenge_id));
create policy "users submit own checkin" on daily_checkins for insert to authenticated with check (user_id=auth.uid() and is_challenge_member(challenge_id));
create policy "members view media metadata" on journal_media for select to authenticated using (is_challenge_member(challenge_id));
create policy "users write own media metadata" on journal_media for all to authenticated using (user_id=auth.uid() and is_challenge_member(challenge_id)) with check (user_id=auth.uid() and is_challenge_member(challenge_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('journal-media','journal-media',false,52428800,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=52428800;

create policy "members read journal media" on storage.objects for select to authenticated
using (bucket_id='journal-media' and is_challenge_member((storage.foldername(name))[1]::uuid));
create policy "users upload own journal media" on storage.objects for insert to authenticated
with check (bucket_id='journal-media' and (storage.foldername(name))[2]=auth.uid()::text and is_challenge_member((storage.foldername(name))[1]::uuid));
create policy "users delete own journal media" on storage.objects for delete to authenticated
using (bucket_id='journal-media' and owner_id=auth.uid()::text);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin insert into profiles(id,display_name,avatar_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url'); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
