begin;

-- Database Performance & Vacuum Settings Tuning for High-Volume Entrance Operations
alter table public.checkin_ledger set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

alter table public.reservations set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

alter table public.walk_ins set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- High-speed composite indexes for zero-latency door queries
create index if not exists checkin_ledger_event_reservation_idx 
  on public.checkin_ledger (event_id, reservation_id);

create index if not exists checkin_ledger_event_walkin_idx 
  on public.checkin_ledger (event_id, walk_in_id);

create index if not exists reservations_event_guestname_idx 
  on public.reservations (event_id, guest_name);

commit;
