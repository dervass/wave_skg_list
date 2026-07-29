begin;

comment on column public.reservations.phone_last_four is
  'Legacy internal value retained for historical compatibility; no longer accepted, searched, displayed, or exported.';

create or replace function public.set_reservation_normalized_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_guest_name := public.normalize_guest_name(new.guest_name);
  new.normalized_phone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  new.normalized_instagram := nullif(lower(trim(leading '@' from coalesce(new.instagram_username, ''))), '');
  new.updated_at := now();
  return new;
end;
$$;

drop function public.search_reservations(uuid, text);

create function public.search_reservations(
  p_event_id uuid,
  p_query text default ''
)
returns table (
  id uuid,
  event_id uuid,
  guest_name text,
  phone text,
  instagram_username text,
  expected_group_size integer,
  source public.reservation_source,
  pr_id uuid,
  pr_name text,
  note text,
  status public.reservation_status,
  arrived_count integer,
  attribution_locked_at timestamptz,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_phone_query text := regexp_replace(lower(trim(coalesce(p_query, ''))), '\D', '', 'g');
begin
  if not public.has_event_access(p_event_id) then
    raise exception 'Not assigned to this event';
  end if;
  return query
  select
    r.id,
    r.event_id,
    r.guest_name,
    r.phone,
    r.instagram_username,
    r.expected_group_size,
    r.source,
    r.pr_id,
    p.name,
    r.note,
    r.status,
    coalesce(sum(l.attendance_delta), 0)::integer,
    r.attribution_locked_at,
    r.created_by,
    r.created_at
  from public.reservations r
  left join public.prs p on p.id = r.pr_id
  left join public.checkin_ledger l on l.reservation_id = r.id
  where r.event_id = p_event_id
    and (
      v_query = ''
      or lower(r.guest_name) like '%' || v_query || '%'
      or (
        char_length(v_phone_query) >= 8
        and r.normalized_phone like '%' || v_phone_query || '%'
      )
      or r.normalized_instagram like '%' || trim(leading '@' from v_query) || '%'
    )
  group by r.id, p.name
  order by
    case r.status when 'reserved' then 0 when 'partially_arrived' then 1 else 2 end,
    r.guest_name;
end;
$$;

create or replace function public.create_reservation_v2(
  p_event_id uuid,
  p_guest_name text,
  p_phone text,
  p_instagram_username text,
  p_expected_group_size integer,
  p_source public.reservation_source,
  p_pr_id uuid,
  p_note text,
  p_duplicate_resolution text default null,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.reservations;
  v_created public.reservations;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_instagram text := nullif(lower(trim(leading '@' from coalesce(p_instagram_username, ''))), '');
  v_name text := public.normalize_guest_name(p_guest_name);
  v_reasons text[] := array[]::text[];
  v_status public.reservation_status := 'reserved';
begin
  if not public.is_event_organizer(p_event_id) then
    raise exception 'Organizer access required';
  end if;
  if (select status = 'closed' from public.events where id = p_event_id) then
    raise exception 'Event is closed';
  end if;
  if v_phone is null and v_instagram is null then
    raise exception 'A full phone number or Instagram username is required';
  end if;
  if v_phone is not null and char_length(v_phone) < 8 then
    raise exception 'Enter a full phone number';
  end if;
  if (p_source = 'pr' and p_pr_id is null) or (p_source = 'direct' and p_pr_id is not null) then
    raise exception 'Invalid attribution';
  end if;

  select r.* into v_existing
  from public.reservations r
  where r.event_id = p_event_id
    and r.status not in ('duplicate', 'voided')
    and (
      (v_phone is not null and r.normalized_phone = v_phone)
      or (v_instagram is not null and r.normalized_instagram = v_instagram)
      or extensions.similarity(r.normalized_guest_name, v_name) >= 0.76
    )
  order by r.created_at
  limit 1;

  if v_existing.id is not null then
    if v_phone is not null and v_existing.normalized_phone = v_phone then
      v_reasons := array_append(v_reasons, 'phone');
    end if;
    if v_instagram is not null and v_existing.normalized_instagram = v_instagram then
      v_reasons := array_append(v_reasons, 'instagram');
    end if;
    if extensions.similarity(v_existing.normalized_guest_name, v_name) >= 0.76 then
      v_reasons := array_append(v_reasons, 'similar_name');
    end if;
    if p_duplicate_resolution is null then
      return jsonb_build_object(
        'duplicate_found', true,
        'match_reasons', v_reasons,
        'existing_reservation', jsonb_build_object(
          'id', v_existing.id,
          'guest_name', v_existing.guest_name,
          'source', v_existing.source,
          'pr_id', v_existing.pr_id,
          'pr_name', (select name from public.prs where id = v_existing.pr_id),
          'expected_group_size', v_existing.expected_group_size,
          'created_at', v_existing.created_at
        )
      );
    end if;
    if p_duplicate_resolution not in ('create', 'mark_duplicate') then
      raise exception 'Invalid duplicate resolution';
    end if;
    if char_length(trim(coalesce(p_override_reason, ''))) < 8 then
      raise exception 'Duplicate override reason is required';
    end if;
    if p_duplicate_resolution = 'mark_duplicate' then
      v_status := 'duplicate';
    end if;
  end if;

  insert into public.reservations (
    event_id, guest_name, normalized_guest_name, phone, normalized_phone,
    phone_last_four, instagram_username, normalized_instagram,
    expected_group_size, source, pr_id, note, status, created_by
  ) values (
    p_event_id, trim(p_guest_name), v_name, nullif(trim(p_phone), ''), v_phone,
    null, nullif(trim(p_instagram_username), ''), v_instagram,
    p_expected_group_size, p_source, p_pr_id, nullif(trim(p_note), ''),
    v_status, auth.uid()
  ) returning * into v_created;

  if v_existing.id is not null then
    insert into public.duplicate_reviews (
      event_id, candidate_reservation_id, existing_reservation_id, match_reasons,
      resolution, override_reason, reviewed_by
    ) values (
      p_event_id, v_created.id, v_existing.id, v_reasons,
      case when v_status = 'duplicate' then 'marked_duplicate' else 'created_override' end,
      trim(p_override_reason), auth.uid()
    );
  end if;

  insert into public.audit_logs (
    event_id, actor_id, action, entity_type, entity_id, reason, after_data
  ) values (
    p_event_id, auth.uid(), 'reservation.created', 'reservation', v_created.id::text,
    p_override_reason, to_jsonb(v_created)
  );
  return jsonb_build_object(
    'duplicate_found', v_existing.id is not null,
    'reservation', to_jsonb(v_created) - 'phone_last_four'
  );
end;
$$;

create or replace function public.edit_reservation_details_v2(
  p_reservation_id uuid,
  p_guest_name text,
  p_phone text,
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
  if v_phone is null and v_instagram is null then
    raise exception 'A full phone number or Instagram username is required';
  end if;
  if v_phone is not null and char_length(v_phone) < 8 then
    raise exception 'Enter a full phone number';
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
    phone_last_four = null,
    instagram_username = nullif(trim(p_instagram_username), ''),
    expected_group_size = p_expected_group_size,
    note = nullif(trim(p_note), '')
  where id = p_reservation_id
  returning * into v_after;
  insert into public.audit_logs (
    event_id, actor_id, action, entity_type, entity_id, reason, before_data, after_data
  ) values (
    v_before.event_id, auth.uid(), 'reservation.edited', 'reservation',
    p_reservation_id::text, trim(p_reason),
    to_jsonb(v_before) - 'phone_last_four',
    to_jsonb(v_after) - 'phone_last_four'
  );
  return to_jsonb(v_after) - 'phone_last_four';
end;
$$;

grant execute on function public.search_reservations(uuid, text) to authenticated;
grant execute on function public.create_reservation_v2(
  uuid, text, text, text, integer, public.reservation_source, uuid, text, text, text
) to authenticated;
grant execute on function public.edit_reservation_details_v2(
  uuid, text, text, text, integer, text, text
) to authenticated;

commit;
