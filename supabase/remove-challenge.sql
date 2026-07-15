-- Owners delete the shared challenge; partners leave only their membership.
create or replace function public.remove_challenge(target_challenge uuid)
returns text language plpgsql security definer set search_path = public, storage
as $$
declare member_role text;
begin
  select role into member_role from public.challenge_members
  where challenge_id=target_challenge and user_id=auth.uid() and status='accepted';
  if member_role is null then raise exception 'You are not a member of this challenge.'; end if;
  if member_role='owner' then
    delete from storage.objects where bucket_id='journal-media' and name like target_challenge::text || '/%';
    delete from public.challenges where id=target_challenge and owner_id=auth.uid();
    return 'deleted';
  end if;
  delete from public.challenge_members where challenge_id=target_challenge and user_id=auth.uid();
  return 'left';
end;
$$;
grant execute on function public.remove_challenge(uuid) to authenticated;
