export type AppRole = "admin" | "organizer" | "door";

export type ReservationStatus =
  | "reserved"
  | "partially_arrived"
  | "fully_arrived"
  | "cancelled"
  | "no_show"
  | "duplicate"
  | "voided";

export type ReservationSource = "direct" | "pr";

export type WalkInKind =
  | "direct"
  | "pr"
  | "venue"
  | "complimentary"
  | "staff";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: AppRole;
  is_active: boolean;
}

export interface EventSummary {
  id: string;
  name: string;
  venue_name: string;
  starts_at: string;
  status: "draft" | "open" | "closed";
}

export interface Pr {
  id: string;
  name: string;
  active: boolean;
}

export interface Reservation {
  id: string;
  event_id: string;
  guest_name: string;
  phone: string | null;
  instagram_username: string | null;
  expected_group_size: number;
  source: ReservationSource;
  pr_id: string | null;
  pr_name?: string | null;
  note: string | null;
  status: ReservationStatus;
  arrived_count: number;
  attribution_locked_at: string | null;
  created_by: string;
  created_at: string;
}

export interface OfflineCheckinOperation {
  idempotencyKey: string;
  kind: "checkin" | "walk_in" | "adjustment";
  eventId: string;
  reservationId?: string;
  walkInId?: string;
  delta: number;
  walkInKind?: WalkInKind;
  guestName?: string;
  prId?: string;
  prConfirmed?: boolean;
  note?: string;
  reason?: string;
  recordedAt: string;
}

export interface SettlementLine {
  prId: string;
  prName: string;
  attendees: number;
  amountOwedCents: number;
}

export interface SettlementSummary {
  eligibleAttendees: number;
  prAttendees: number;
  directAttendees: number;
  nonRevenueAttendees: number;
  venuePaymentCents: number;
  totalPrCommissionCents: number;
  retainedCents: number;
  prLines: SettlementLine[];
}
