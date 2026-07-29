begin;

create policy profiles_event_organizer_select on public.profiles
for select to authenticated using (
  public.current_app_role() in ('admin', 'organizer')
  and exists (
    select 1
    from public.event_assignments target
    join public.event_assignments actor on actor.event_id = target.event_id
    where target.user_id = profiles.id
      and actor.user_id = (select auth.uid())
  )
);

create or replace function public.edit_reservation_details(
  p_reservation_id uuid,
  p_guest_name text,
  p_phone text,
  p_phone_last_four text,
  p_instagram_username text,
  p_expected_group_size integer,
  p_note text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.reservations;
  v_after public.reservations;
  v_arrived integer;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_instagram text := nullif(lower(trim(leading '@' from coalesce(p_instagram_username, ''))), '');
begin
  select * into v_before
  from public.reservations
  where id = p_reservation_id
  for update;
  if v_before.id is null or not public.is_event_organizer(v_before.event_id) then
    raise exception 'Organizer access required';
  end if;
  if (select status = 'closed' from public.events where id = v_before.event_id) then
    raise exception 'Event is closed';
  end if;
  if v_before.status in ('cancelled', 'duplicate', 'voided', 'no_show') then
    raise exception 'Reservation is not editable';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Edit reason is required';
  end if;
  if v_phone is null and p_phone_last_four is null and v_instagram is null then
    raise exception 'A secondary identifier is required';
  end if;
  select coalesce(sum(attendance_delta), 0)::integer into v_arrived
  from public.checkin_ledger where reservation_id = p_reservation_id;
  if p_expected_group_size < v_arrived then
    raise exception 'Expected group size cannot be below arrived count';
  end if;
  update public.reservations
  set
    guest_name = trim(p_guest_name),
    phone = nullif(trim(p_phone), ''),
    phone_last_four = nullif(trim(p_phone_last_four), ''),
    instagram_username = nullif(trim(p_instagram_username), ''),
    expected_group_size = p_expected_group_size,
    note = nullif(trim(p_note), '')
  where id = p_reservation_id
  returning * into v_after;
  insert into public.audit_logs (
    event_id, actor_id, action, entity_type, entity_id, reason, before_data, after_data
  ) values (
    v_before.event_id, auth.uid(), 'reservation.edited', 'reservation',
    p_reservation_id::text, trim(p_reason), to_jsonb(v_before), to_jsonb(v_after)
  );
  return to_jsonb(v_after);
end;
$$;

grant execute on function public.edit_reservation_details(
  uuid, text, text, text, text, integer, text, text
) to authenticated;

commit;
