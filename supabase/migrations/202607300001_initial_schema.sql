begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.app_role as enum ('admin', 'organizer', 'door');
create type public.event_status as enum ('draft', 'open', 'closed');
create type public.reservation_source as enum ('direct', 'pr');
create type public.reservation_status as enum (
  'reserved',
  'partially_arrived',
  'fully_arrived',
  'cancelled',
  'no_show',
  'duplicate',
  'voided'
);
create type public.walk_in_kind as enum (
  'direct',
  'pr',
  'venue',
  'complimentary',
  'staff'
);
create type public.ledger_entry_kind as enum ('checkin', 'adjustment');
create type public.sync_operation_status as enum ('received', 'applied', 'conflict');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9._-]{2,50}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue_name text not null,
  starts_at timestamptz not null,
  status public.event_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_financial_settings (
  event_id uuid primary key references public.events(id) on delete restrict,
  venue_rate_cents integer not null default 600 check (venue_rate_cents >= 0),
  pr_rate_cents integer not null default 250 check (pr_rate_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.event_assignments (
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.prs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index prs_name_unique_ci on public.prs (lower(name));

create table public.event_prs (
  event_id uuid not null references public.events(id) on delete restrict,
  pr_id uuid not null references public.prs(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, pr_id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  normalized_guest_name text not null,
  phone text,
  normalized_phone text,
  phone_last_four text check (phone_last_four is null or phone_last_four ~ '^\d{4}$'),
  instagram_username text,
  normalized_instagram text,
  expected_group_size integer not null check (expected_group_size between 1 and 99),
  source public.reservation_source not null,
  pr_id uuid references public.prs(id) on delete restrict,
  note text check (char_length(note) <= 500),
  status public.reservation_status not null default 'reserved',
  attribution_locked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_secondary_identifier check (
    normalized_phone is not null
    or phone_last_four is not null
    or normalized_instagram is not null
  ),
  constraint reservation_source_pr check (
    (source = 'direct' and pr_id is null)
    or (source = 'pr' and pr_id is not null)
  )
);

create index reservations_event_status_idx
  on public.reservations (event_id, status);
create index reservations_event_phone_idx
  on public.reservations (event_id, normalized_phone)
  where normalized_phone is not null;
create index reservations_event_last_four_idx
  on public.reservations (event_id, phone_last_four)
  where phone_last_four is not null;
create index reservations_event_instagram_idx
  on public.reservations (event_id, normalized_instagram)
  where normalized_instagram is not null;
create index reservations_name_trgm_idx
  on public.reservations using gin (normalized_guest_name extensions.gin_trgm_ops);

create table public.walk_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  kind public.walk_in_kind not null,
  person_count integer not null check (person_count between 1 and 99),
  pr_id uuid references public.prs(id) on delete restrict,
  pr_personally_confirmed boolean not null default false,
  note text check (char_length(note) <= 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint walk_in_pr_attribution check (
    (kind = 'pr' and pr_id is not null and pr_personally_confirmed)
    or (kind <> 'pr' and pr_id is null)
  )
);

create table public.checkin_ledger (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete restrict,
  walk_in_id uuid references public.walk_ins(id) on delete restrict,
  entry_kind public.ledger_entry_kind not null,
  attendance_delta integer not null check (attendance_delta <> 0),
  revenue_eligible boolean not null,
  pr_id_at_time uuid references public.prs(id) on delete restrict,
  operator_id uuid not null references public.profiles(id),
  original_ledger_id uuid references public.checkin_ledger(id) on delete restrict,
  reason text,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  constraint ledger_subject check (
    (reservation_id is not null and walk_in_id is null)
    or (reservation_id is null and walk_in_id is not null)
  ),
  constraint adjustment_reason check (
    (entry_kind = 'checkin' and attendance_delta > 0 and reason is null)
    or (entry_kind = 'adjustment' and char_length(reason) >= 8)
  )
);

create index checkin_ledger_event_idx on public.checkin_ledger (event_id, occurred_at desc);
create index checkin_ledger_reservation_idx on public.checkin_ledger (reservation_id);
create index checkin_ledger_walk_in_idx on public.checkin_ledger (walk_in_id);

create table public.duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  candidate_reservation_id uuid references public.reservations(id) on delete restrict,
  existing_reservation_id uuid not null references public.reservations(id) on delete restrict,
  match_reasons text[] not null,
  resolution text not null check (resolution in ('created_override', 'marked_duplicate')),
  override_reason text not null check (char_length(override_reason) >= 8),
  reviewed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.event_settlements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  version integer not null,
  eligible_attendees integer not null,
  pr_attendees integer not null,
  direct_attendees integer not null,
  non_revenue_attendees integer not null,
  venue_rate_cents integer not null,
  pr_rate_cents integer not null,
  venue_payment_cents integer not null,
  total_pr_commission_cents integer not null,
  retained_cents integer not null,
  pr_lines jsonb not null,
  closed_by uuid not null references public.profiles(id),
  closed_at timestamptz not null default now(),
  unique (event_id, version)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_event_created_idx on public.audit_logs (event_id, created_at desc);

create table public.offline_sync_operations (
  idempotency_key uuid primary key,
  event_id uuid not null references public.events(id) on delete restrict,
  operator_id uuid not null references public.profiles(id),
  operation_type text not null,
  payload jsonb not null,
  status public.sync_operation_status not null default 'received',
  result jsonb,
  conflict_reason text,
  client_recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.login_attempts (
  id bigint generated always as identity primary key,
  username text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_rate_idx
  on public.login_attempts (username, attempted_at desc)
  where succeeded = false;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid()) and is_active;
$$;

create or replace function public.has_event_access(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_assignments ea
    join public.profiles p on p.id = ea.user_id
    where ea.event_id = p_event_id
      and ea.user_id = (select auth.uid())
      and p.is_active
  );
$$;

create or replace function public.is_event_organizer(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_event_access(p_event_id)
    and public.current_app_role() in ('admin', 'organizer');
$$;

create or replace function public.normalize_guest_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(p_value), '[^[:alnum:]]+', ' ', 'g'));
$$;

create or replace function public.set_reservation_normalized_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_guest_name := public.normalize_guest_name(new.guest_name);
  new.normalized_phone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  if new.normalized_phone is not null and char_length(new.normalized_phone) >= 4 then
    new.phone_last_four := coalesce(new.phone_last_four, right(new.normalized_phone, 4));
  end if;
  new.normalized_instagram := nullif(lower(trim(leading '@' from coalesce(new.instagram_username, ''))), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger reservations_normalize_before_write
before insert or update on public.reservations
for each row execute function public.set_reservation_normalized_fields();

create or replace function public.prevent_immutable_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger checkin_ledger_immutable
before update or delete on public.checkin_ledger
for each row execute function public.prevent_immutable_mutation();

create trigger event_settlements_immutable
before update or delete on public.event_settlements
for each row execute function public.prevent_immutable_mutation();

create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_immutable_mutation();

create or replace function public.check_login_rate_limit(p_username text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select count(*) < 100
  from public.login_attempts
  where username = lower(p_username)
    and succeeded = false
    and attempted_at > now() - interval '15 minutes';
$$;

create or replace function public.record_login_attempt(
  p_username text,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.login_attempts (username, succeeded)
  values (lower(p_username), p_success);
  if p_success then
    delete from public.login_attempts
    where username = lower(p_username)
      and attempted_at < now() - interval '1 hour';
  end if;
end;
$$;

revoke all on function public.check_login_rate_limit(text) from public, anon, authenticated;
revoke all on function public.record_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.check_login_rate_limit(text) to service_role;
grant execute on function public.record_login_attempt(text, boolean) to service_role;

create or replace function public.search_reservations(
  p_event_id uuid,
  p_query text default ''
)
returns table (
  id uuid,
  event_id uuid,
  guest_name text,
  phone text,
  phone_last_four text,
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
    r.phone_last_four,
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
      or r.normalized_phone like '%' || regexp_replace(v_query, '\D', '', 'g') || '%'
      or r.phone_last_four like '%' || regexp_replace(v_query, '\D', '', 'g') || '%'
      or r.normalized_instagram like '%' || trim(leading '@' from v_query) || '%'
    )
  group by r.id, p.name
  order by
    case r.status when 'reserved' then 0 when 'partially_arrived' then 1 else 2 end,
    r.guest_name;
end;
$$;

create or replace function public.create_reservation_with_duplicate_check(
  p_event_id uuid,
  p_guest_name text,
  p_phone text,
  p_phone_last_four text,
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
  v_last_four text := coalesce(p_phone_last_four, right(v_phone, 4));
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
  if v_phone is null and v_last_four is null and v_instagram is null then
    raise exception 'A secondary identifier is required';
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
      or (v_last_four is not null and r.phone_last_four = v_last_four)
      or (v_instagram is not null and r.normalized_instagram = v_instagram)
      or extensions.similarity(r.normalized_guest_name, v_name) >= 0.76
    )
  order by r.created_at
  limit 1;

  if v_existing.id is not null then
    if v_phone is not null and v_existing.normalized_phone = v_phone then
      v_reasons := array_append(v_reasons, 'phone');
    end if;
    if v_last_four is not null and v_existing.phone_last_four = v_last_four then
      v_reasons := array_append(v_reasons, 'last_four');
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
    v_last_four, nullif(trim(p_instagram_username), ''), v_instagram,
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
  return jsonb_build_object('duplicate_found', v_existing.id is not null, 'reservation', to_jsonb(v_created));
end;
$$;

create or replace function public.record_checkin(
  p_event_id uuid,
  p_reservation_id uuid,
  p_delta integer,
  p_idempotency_key uuid,
  p_recorded_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_arrived integer;
  v_entry public.checkin_ledger;
begin
  if not public.has_event_access(p_event_id) then
    raise exception 'Not assigned to this event';
  end if;
  if p_delta < 1 then raise exception 'Check-in amount must be positive'; end if;
  select * into v_entry from public.checkin_ledger where idempotency_key = p_idempotency_key;
  if v_entry.id is not null then
    return jsonb_build_object('id', v_entry.id, 'idempotent_replay', true);
  end if;
  if (select status = 'closed' from public.events where id = p_event_id) then
    raise exception 'Event is closed';
  end if;
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and event_id = p_event_id
  for update;
  if v_reservation.id is null then raise exception 'Reservation not found'; end if;
  if v_reservation.status in ('cancelled', 'no_show', 'duplicate', 'voided') then
    raise exception 'Reservation is not active';
  end if;
  select coalesce(sum(attendance_delta), 0)::integer into v_arrived
  from public.checkin_ledger where reservation_id = p_reservation_id;
  if v_arrived + p_delta > v_reservation.expected_group_size then
    raise exception 'Check-in exceeds remaining group size';
  end if;

  insert into public.checkin_ledger (
    event_id, reservation_id, entry_kind, attendance_delta, revenue_eligible,
    pr_id_at_time, operator_id, occurred_at, idempotency_key
  ) values (
    p_event_id, p_reservation_id, 'checkin', p_delta, true,
    v_reservation.pr_id, auth.uid(), least(p_recorded_at, now()), p_idempotency_key
  ) returning * into v_entry;

  v_arrived := v_arrived + p_delta;
  update public.reservations
  set
    attribution_locked_at = coalesce(attribution_locked_at, now()),
    status = case
      when v_arrived >= expected_group_size then 'fully_arrived'::public.reservation_status
      else 'partially_arrived'::public.reservation_status
    end
  where id = p_reservation_id;
  return jsonb_build_object('id', v_entry.id, 'arrived_count', v_arrived, 'idempotent_replay', false);
end;
$$;

create or replace function public.record_walk_in(
  p_event_id uuid,
  p_guest_name text,
  p_count integer,
  p_kind public.walk_in_kind,
  p_pr_id uuid,
  p_pr_confirmed boolean,
  p_note text,
  p_idempotency_key uuid,
  p_recorded_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_walk_in public.walk_ins;
  v_entry public.checkin_ledger;
  v_eligible boolean;
begin
  if not public.has_event_access(p_event_id) then raise exception 'Not assigned to this event'; end if;
  select * into v_entry from public.checkin_ledger where idempotency_key = p_idempotency_key;
  if v_entry.id is not null then
    return jsonb_build_object('id', v_entry.id, 'idempotent_replay', true);
  end if;
  if (select status = 'closed' from public.events where id = p_event_id) then
    raise exception 'Event is closed';
  end if;
  if p_kind = 'pr' and (p_pr_id is null or not p_pr_confirmed) then
    raise exception 'PR walk-in must be personally confirmed';
  end if;
  if p_kind <> 'pr' and p_pr_id is not null then raise exception 'Invalid PR attribution'; end if;
  v_eligible := p_kind in ('direct', 'pr');

  insert into public.walk_ins (
    event_id, guest_name, kind, person_count, pr_id, pr_personally_confirmed,
    note, created_by, created_at
  ) values (
    p_event_id, trim(p_guest_name), p_kind, p_count, p_pr_id, p_pr_confirmed,
    nullif(trim(p_note), ''), auth.uid(), least(p_recorded_at, now())
  ) returning * into v_walk_in;

  insert into public.checkin_ledger (
    event_id, walk_in_id, entry_kind, attendance_delta, revenue_eligible,
    pr_id_at_time, operator_id, occurred_at, idempotency_key
  ) values (
    p_event_id, v_walk_in.id, 'checkin', p_count, v_eligible,
    p_pr_id, auth.uid(), least(p_recorded_at, now()), p_idempotency_key
  ) returning * into v_entry;
  return jsonb_build_object('id', v_entry.id, 'walk_in_id', v_walk_in.id, 'idempotent_replay', false);
end;
$$;

create or replace function public.record_correction(
  p_event_id uuid,
  p_reservation_id uuid,
  p_walk_in_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.checkin_ledger;
  v_entry public.checkin_ledger;
  v_total integer;
begin
  if not public.has_event_access(p_event_id) then raise exception 'Not assigned to this event'; end if;
  if p_delta = 0 or char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A non-zero adjustment and written reason are required';
  end if;
  if (p_reservation_id is null) = (p_walk_in_id is null) then
    raise exception 'Choose one correction subject';
  end if;
  select * into v_entry from public.checkin_ledger where idempotency_key = p_idempotency_key;
  if v_entry.id is not null then
    return jsonb_build_object('id', v_entry.id, 'idempotent_replay', true);
  end if;
  select * into v_original
  from public.checkin_ledger
  where event_id = p_event_id
    and (
      (p_reservation_id is not null and reservation_id = p_reservation_id)
      or (p_walk_in_id is not null and walk_in_id = p_walk_in_id)
    )
  order by occurred_at
  limit 1;
  if v_original.id is null then raise exception 'Original check-in not found'; end if;
  select coalesce(sum(attendance_delta), 0)::integer into v_total
  from public.checkin_ledger
  where event_id = p_event_id
    and (
      (p_reservation_id is not null and reservation_id = p_reservation_id)
      or (p_walk_in_id is not null and walk_in_id = p_walk_in_id)
    );
  if v_total + p_delta < 0 then raise exception 'Correction would create negative attendance'; end if;

  insert into public.checkin_ledger (
    event_id, reservation_id, walk_in_id, entry_kind, attendance_delta,
    revenue_eligible, pr_id_at_time, operator_id, original_ledger_id,
    reason, idempotency_key
  ) values (
    p_event_id, p_reservation_id, p_walk_in_id, 'adjustment', p_delta,
    v_original.revenue_eligible, v_original.pr_id_at_time, auth.uid(),
    v_original.id, trim(p_reason), p_idempotency_key
  ) returning * into v_entry;
  insert into public.audit_logs (
    event_id, actor_id, action, entity_type, entity_id, reason, after_data
  ) values (
    p_event_id, auth.uid(), 'attendance.corrected', 'checkin_ledger',
    v_entry.id::text, trim(p_reason), to_jsonb(v_entry)
  );
  return jsonb_build_object('id', v_entry.id, 'adjusted_total', v_total + p_delta);
end;
$$;

create or replace function public.update_reservation(
  p_reservation_id uuid,
  p_action text,
  p_source public.reservation_source,
  p_pr_id uuid,
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
begin
  select * into v_before from public.reservations where id = p_reservation_id for update;
  if v_before.id is null or not public.is_event_organizer(v_before.event_id) then
    raise exception 'Organizer access required';
  end if;
  if (select status = 'closed' from public.events where id = v_before.event_id) then
    raise exception 'Event is closed';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'Reason is required'; end if;
  if p_action = 'cancel' then
    update public.reservations set status = 'cancelled' where id = p_reservation_id;
  elsif p_action = 'void' then
    update public.reservations set status = 'voided' where id = p_reservation_id;
  elsif p_action = 'update_attribution' then
    if v_before.attribution_locked_at is not null then raise exception 'Attribution is locked after first check-in'; end if;
    if (p_source = 'pr' and p_pr_id is null) or (p_source = 'direct' and p_pr_id is not null) then
      raise exception 'Invalid attribution';
    end if;
    update public.reservations set source = p_source, pr_id = p_pr_id where id = p_reservation_id;
  else
    raise exception 'Unknown reservation action';
  end if;
  select * into v_after from public.reservations where id = p_reservation_id;
  insert into public.audit_logs (
    event_id, actor_id, action, entity_type, entity_id, reason, before_data, after_data
  ) values (
    v_before.event_id, auth.uid(), 'reservation.' || p_action, 'reservation',
    p_reservation_id::text, trim(p_reason), to_jsonb(v_before), to_jsonb(v_after)
  );
  return to_jsonb(v_after);
end;
$$;

create or replace function public.get_event_settlement(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue_rate integer;
  v_pr_rate integer;
  v_eligible integer;
  v_pr integer;
  v_direct integer;
  v_non_revenue integer;
  v_lines jsonb;
  v_status public.event_status;
begin
  if not public.is_event_organizer(p_event_id) then raise exception 'Organizer access required'; end if;
  select venue_rate_cents, pr_rate_cents
  into v_venue_rate, v_pr_rate
  from public.event_financial_settings where event_id = p_event_id;
  select status into v_status from public.events where id = p_event_id;
  select
    coalesce(sum(attendance_delta) filter (where revenue_eligible), 0)::integer,
    coalesce(sum(attendance_delta) filter (where revenue_eligible and pr_id_at_time is not null), 0)::integer,
    coalesce(sum(attendance_delta) filter (where revenue_eligible and pr_id_at_time is null), 0)::integer,
    coalesce(sum(attendance_delta) filter (where not revenue_eligible), 0)::integer
  into v_eligible, v_pr, v_direct, v_non_revenue
  from public.checkin_ledger where event_id = p_event_id;
  select coalesce(jsonb_agg(line order by line->>'pr_name'), '[]'::jsonb)
  into v_lines
  from (
    select jsonb_build_object(
      'pr_id', p.id,
      'pr_name', p.name,
      'attendees', sum(l.attendance_delta)::integer,
      'amount_owed_cents', sum(l.attendance_delta)::integer * v_pr_rate
    ) as line
    from public.checkin_ledger l
    join public.prs p on p.id = l.pr_id_at_time
    where l.event_id = p_event_id and l.revenue_eligible
    group by p.id, p.name
    having sum(l.attendance_delta) <> 0
  ) lines;
  return jsonb_build_object(
    'eligible_attendees', v_eligible,
    'pr_attendees', v_pr,
    'direct_attendees', v_direct,
    'non_revenue_attendees', v_non_revenue,
    'venue_payment_cents', v_eligible * v_venue_rate,
    'total_pr_commission_cents', v_pr * v_pr_rate,
    'retained_cents', (v_eligible * v_venue_rate) - (v_pr * v_pr_rate),
    'pr_lines', v_lines,
    'event_status', v_status
  );
end;
$$;

create or replace function public.get_door_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_recent jsonb;
begin
  if not public.has_event_access(p_event_id) then raise exception 'Not assigned to this event'; end if;
  select coalesce(sum(attendance_delta), 0)::integer into v_total
  from public.checkin_ledger where event_id = p_event_id;
  select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
      'id', l.id,
      'guest_name', coalesce(r.guest_name, w.guest_name),
      'delta', l.attendance_delta,
      'created_at', l.occurred_at
    ) item
    from public.checkin_ledger l
    left join public.reservations r on r.id = l.reservation_id
    left join public.walk_ins w on w.id = l.walk_in_id
    where l.event_id = p_event_id
    order by l.occurred_at desc
    limit 8
  ) recent;
  return jsonb_build_object('total_checked_in', v_total, 'recent', v_recent);
end;
$$;

create or replace function public.close_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_summary jsonb;
  v_version integer;
  v_settings public.event_financial_settings;
begin
  if not public.is_event_organizer(p_event_id) then raise exception 'Organizer access required'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.status = 'closed' then raise exception 'Event is already closed'; end if;
  update public.reservations
  set status = 'no_show'
  where event_id = p_event_id and status = 'reserved';
  v_summary := public.get_event_settlement(p_event_id);
  select * into v_settings from public.event_financial_settings where event_id = p_event_id;
  select coalesce(max(version), 0) + 1 into v_version
  from public.event_settlements where event_id = p_event_id;
  insert into public.event_settlements (
    event_id, version, eligible_attendees, pr_attendees, direct_attendees,
    non_revenue_attendees, venue_rate_cents, pr_rate_cents,
    venue_payment_cents, total_pr_commission_cents, retained_cents,
    pr_lines, closed_by
  ) values (
    p_event_id, v_version,
    (v_summary->>'eligible_attendees')::integer,
    (v_summary->>'pr_attendees')::integer,
    (v_summary->>'direct_attendees')::integer,
    (v_summary->>'non_revenue_attendees')::integer,
    v_settings.venue_rate_cents, v_settings.pr_rate_cents,
    (v_summary->>'venue_payment_cents')::integer,
    (v_summary->>'total_pr_commission_cents')::integer,
    (v_summary->>'retained_cents')::integer,
    v_summary->'pr_lines', auth.uid()
  );
  update public.events set status = 'closed', closed_by = auth.uid(), closed_at = now()
  where id = p_event_id;
  insert into public.audit_logs (event_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_event_id, auth.uid(), 'event.closed', 'event', p_event_id::text, v_summary);
  return v_summary || jsonb_build_object('version', v_version, 'event_status', 'closed');
end;
$$;

create or replace function public.reopen_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_event_organizer(p_event_id) then raise exception 'Organizer access required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'Reopening reason is required'; end if;
  if (select status <> 'closed' from public.events where id = p_event_id) then
    raise exception 'Event is not closed';
  end if;
  update public.events set status = 'open', closed_by = null, closed_at = null
  where id = p_event_id;
  insert into public.audit_logs (event_id, actor_id, action, entity_type, entity_id, reason)
  values (p_event_id, auth.uid(), 'event.reopened', 'event', p_event_id::text, trim(p_reason));
  return jsonb_build_object('event_status', 'open');
end;
$$;

create or replace function public.process_offline_operation(p_operation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key uuid := (p_operation->>'idempotencyKey')::uuid;
  v_event_id uuid := (p_operation->>'eventId')::uuid;
  v_kind text := p_operation->>'kind';
  v_existing public.offline_sync_operations;
  v_result jsonb;
begin
  if not public.has_event_access(v_event_id) then raise exception 'Not assigned to this event'; end if;
  select * into v_existing from public.offline_sync_operations where idempotency_key = v_key;
  if v_existing.idempotency_key is not null then
    return coalesce(v_existing.result, jsonb_build_object('status', v_existing.status));
  end if;
  insert into public.offline_sync_operations (
    idempotency_key, event_id, operator_id, operation_type, payload, client_recorded_at
  ) values (
    v_key, v_event_id, auth.uid(), v_kind, p_operation,
    (p_operation->>'recordedAt')::timestamptz
  );
  begin
    if v_kind = 'checkin' then
      v_result := public.record_checkin(
        v_event_id,
        (p_operation->>'reservationId')::uuid,
        (p_operation->>'delta')::integer,
        v_key,
        (p_operation->>'recordedAt')::timestamptz
      );
    elsif v_kind = 'walk_in' then
      v_result := public.record_walk_in(
        v_event_id,
        p_operation->>'guestName',
        (p_operation->>'delta')::integer,
        (p_operation->>'walkInKind')::public.walk_in_kind,
        nullif(p_operation->>'prId', '')::uuid,
        coalesce((p_operation->>'prConfirmed')::boolean, false),
        p_operation->>'note',
        v_key,
        (p_operation->>'recordedAt')::timestamptz
      );
    elsif v_kind = 'adjustment' then
      v_result := public.record_correction(
        v_event_id,
        nullif(p_operation->>'reservationId', '')::uuid,
        nullif(p_operation->>'walkInId', '')::uuid,
        (p_operation->>'delta')::integer,
        p_operation->>'reason',
        v_key
      );
    else
      raise exception 'Unknown offline operation';
    end if;
    v_result := v_result || jsonb_build_object('status', 'applied');
    update public.offline_sync_operations
    set status = 'applied', result = v_result, processed_at = now()
    where idempotency_key = v_key;
  exception when others then
    v_result := jsonb_build_object('status', 'conflict', 'error', sqlerrm);
    update public.offline_sync_operations
    set status = 'conflict', result = v_result, conflict_reason = sqlerrm, processed_at = now()
    where idempotency_key = v_key;
  end;
  return v_result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_financial_settings enable row level security;
alter table public.event_assignments enable row level security;
alter table public.prs enable row level security;
alter table public.event_prs enable row level security;
alter table public.reservations enable row level security;
alter table public.walk_ins enable row level security;
alter table public.checkin_ledger enable row level security;
alter table public.duplicate_reviews enable row level security;
alter table public.event_settlements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.offline_sync_operations enable row level security;
alter table public.login_attempts enable row level security;

create policy profiles_self_select on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_admin_all on public.profiles
for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy events_assigned_select on public.events
for select to authenticated using (public.has_event_access(id));
create policy events_organizer_update on public.events
for update to authenticated
using (public.is_event_organizer(id))
with check (public.is_event_organizer(id));

create policy financial_organizer_select on public.event_financial_settings
for select to authenticated using (public.is_event_organizer(event_id));
create policy financial_admin_update on public.event_financial_settings
for update to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy assignments_self_select on public.event_assignments
for select to authenticated using (user_id = (select auth.uid()));
create policy assignments_admin_all on public.event_assignments
for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy prs_assigned_select on public.prs
for select to authenticated using (
  public.current_app_role() in ('admin', 'organizer')
  or exists (
      select 1 from public.event_prs ep
      where ep.pr_id = id and public.has_event_access(ep.event_id)
    )
);
create policy prs_organizer_insert on public.prs
for insert to authenticated
with check (public.current_app_role() in ('admin', 'organizer') and created_by = (select auth.uid()));
create policy prs_organizer_update on public.prs
for update to authenticated
using (public.current_app_role() in ('admin', 'organizer'))
with check (public.current_app_role() in ('admin', 'organizer'));

create policy event_prs_assigned_select on public.event_prs
for select to authenticated using (public.has_event_access(event_id));
create policy event_prs_organizer_insert on public.event_prs
for insert to authenticated with check (public.is_event_organizer(event_id));
create policy event_prs_organizer_update on public.event_prs
for update to authenticated
using (public.is_event_organizer(event_id))
with check (public.is_event_organizer(event_id));

create policy reservations_organizer_select on public.reservations
for select to authenticated using (public.is_event_organizer(event_id));
create policy reservations_organizer_insert on public.reservations
for insert to authenticated with check (public.is_event_organizer(event_id));
create policy reservations_organizer_update on public.reservations
for update to authenticated
using (public.is_event_organizer(event_id))
with check (public.is_event_organizer(event_id));

create policy walk_ins_organizer_select on public.walk_ins
for select to authenticated using (public.is_event_organizer(event_id));
create policy ledger_organizer_select on public.checkin_ledger
for select to authenticated using (public.is_event_organizer(event_id));
create policy duplicate_reviews_organizer_select on public.duplicate_reviews
for select to authenticated using (public.is_event_organizer(event_id));
create policy settlements_organizer_select on public.event_settlements
for select to authenticated using (public.is_event_organizer(event_id));
create policy audit_organizer_select on public.audit_logs
for select to authenticated using (event_id is not null and public.is_event_organizer(event_id));
create policy offline_self_select on public.offline_sync_operations
for select to authenticated using (operator_id = (select auth.uid()));
create policy offline_organizer_select on public.offline_sync_operations
for select to authenticated using (public.is_event_organizer(event_id));

revoke all on all tables in schema public from anon;
grant select on public.profiles, public.events, public.event_assignments, public.prs, public.event_prs to authenticated;
grant select, insert, update on public.reservations to authenticated;
grant insert on public.prs, public.event_prs to authenticated;
grant update on public.prs, public.event_prs to authenticated;
grant select on public.walk_ins, public.checkin_ledger, public.duplicate_reviews,
  public.event_settlements, public.audit_logs, public.offline_sync_operations to authenticated;
grant select, update on public.event_financial_settings to authenticated;

grant execute on function public.search_reservations(uuid, text) to authenticated;
grant execute on function public.create_reservation_with_duplicate_check(
  uuid, text, text, text, text, integer, public.reservation_source, uuid, text, text, text
) to authenticated;
grant execute on function public.record_checkin(uuid, uuid, integer, uuid, timestamptz) to authenticated;
grant execute on function public.record_walk_in(
  uuid, text, integer, public.walk_in_kind, uuid, boolean, text, uuid, timestamptz
) to authenticated;
grant execute on function public.record_correction(uuid, uuid, uuid, integer, text, uuid) to authenticated;
grant execute on function public.update_reservation(
  uuid, text, public.reservation_source, uuid, text
) to authenticated;
grant execute on function public.get_event_settlement(uuid) to authenticated;
grant execute on function public.get_door_summary(uuid) to authenticated;
grant execute on function public.close_event(uuid) to authenticated;
grant execute on function public.reopen_event(uuid, text) to authenticated;
grant execute on function public.process_offline_operation(jsonb) to authenticated;

commit;
