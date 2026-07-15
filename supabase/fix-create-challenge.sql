-- Fixes invite-code generation on Supabase projects where extensions live in
-- the dedicated `extensions` schema. Safe to run on the existing database.
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
