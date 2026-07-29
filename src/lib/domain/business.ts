import type {
  AppRole,
  Reservation,
  SettlementLine,
  SettlementSummary,
} from "@/lib/domain/types";

export const VENUE_RATE_CENTS = 600;
export const PR_RATE_CENTS = 250;

export interface AttendanceEntry {
  delta: number;
  revenueEligible: boolean;
  prId: string | null;
  prName?: string | null;
}

const NON_DIGITS = /\D/g;
const INSTAGRAM_PREFIX = /^@/;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_NAME_CHARS = /[^\p{L}\p{N}\s]/gu;

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(NON_DIGITS, "");
  return normalized.length >= 4 ? normalized : null;
}

export function normalizeInstagram(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLocaleLowerCase("en")
    .replace(INSTAGRAM_PREFIX, "");
  return normalized || null;
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLocaleLowerCase("en")
    .replace(NON_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function namesAreSimilar(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  return longest >= 5 && levenshtein(a, b) / longest <= 0.24;
}

export type DuplicateReason =
  | "phone"
  | "instagram"
  | "similar_name";

export function duplicateReasons(
  candidate: Pick<
    Reservation,
    "guest_name" | "phone" | "instagram_username"
  >,
  existing: Pick<
    Reservation,
    "guest_name" | "phone" | "instagram_username"
  >,
): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  const candidatePhone = normalizePhone(candidate.phone);
  const existingPhone = normalizePhone(existing.phone);
  if (candidatePhone && existingPhone && candidatePhone === existingPhone) {
    reasons.push("phone");
  }
  const candidateInstagram = normalizeInstagram(candidate.instagram_username);
  const existingInstagram = normalizeInstagram(existing.instagram_username);
  if (
    candidateInstagram &&
    existingInstagram &&
    candidateInstagram === existingInstagram
  ) {
    reasons.push("instagram");
  }
  if (namesAreSimilar(candidate.guest_name, existing.guest_name)) {
    reasons.push("similar_name");
  }
  return reasons;
}

export function findDuplicateCandidates(
  eventId: string,
  candidate: Pick<
    Reservation,
    "guest_name" | "phone" | "instagram_username"
  >,
  existing: Array<
    Pick<
      Reservation,
      | "id"
      | "event_id"
      | "guest_name"
      | "phone"
      | "instagram_username"
    >
  >,
) {
  return existing
    .filter((reservation) => reservation.event_id === eventId)
    .map((reservation) => ({
      reservation,
      reasons: duplicateReasons(candidate, reservation),
    }))
    .filter((match) => match.reasons.length > 0);
}

export function canChangeAttribution(
  attributionLockedAt: string | null,
): boolean {
  return attributionLockedAt === null;
}

export function attributionOverrideIsValid(
  attributionChanged: boolean,
  reason: string | null | undefined,
): boolean {
  return !attributionChanged || (reason?.trim().length ?? 0) >= 8;
}

export function canViewFinancials(role: AppRole): boolean {
  return role === "admin" || role === "organizer";
}

export function canNormallyEditEvent(
  role: AppRole,
  eventStatus: "draft" | "open" | "closed",
): boolean {
  return (role === "admin" || role === "organizer") && eventStatus !== "closed";
}

export function sumUniqueOperations(
  operations: Array<{ idempotencyKey: string; delta: number }>,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const operation of operations) {
    if (seen.has(operation.idempotencyKey)) continue;
    seen.add(operation.idempotencyKey);
    total += operation.delta;
  }
  return total;
}

export function calculateSettlement(
  entries: AttendanceEntry[],
): SettlementSummary {
  let eligibleAttendees = 0;
  let prAttendees = 0;
  let directAttendees = 0;
  let nonRevenueAttendees = 0;
  const prMap = new Map<string, SettlementLine>();

  for (const entry of entries) {
    if (!entry.revenueEligible) {
      nonRevenueAttendees += entry.delta;
      continue;
    }
    eligibleAttendees += entry.delta;
    if (entry.prId) {
      prAttendees += entry.delta;
      const current = prMap.get(entry.prId) ?? {
        prId: entry.prId,
        prName: entry.prName ?? "Unknown PR",
        attendees: 0,
        amountOwedCents: 0,
      };
      current.attendees += entry.delta;
      current.amountOwedCents = current.attendees * PR_RATE_CENTS;
      prMap.set(entry.prId, current);
    } else {
      directAttendees += entry.delta;
    }
  }

  const venuePaymentCents = eligibleAttendees * VENUE_RATE_CENTS;
  const totalPrCommissionCents = prAttendees * PR_RATE_CENTS;
  return {
    eligibleAttendees,
    prAttendees,
    directAttendees,
    nonRevenueAttendees,
    venuePaymentCents,
    totalPrCommissionCents,
    retainedCents: venuePaymentCents - totalPrCommissionCents,
    prLines: [...prMap.values()].sort((a, b) =>
      a.prName.localeCompare(b.prName),
    ),
  };
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export interface ParsedReservation {
  guestName: string;
  expectedGroupSize: number;
  phone: string | null;
  instagramUsername: string | null;
  error: string | null;
}

export function parseReservationLines(input: string): ParsedReservation[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((part) => part.trim());
      const size = Number.parseInt(parts[1] ?? "", 10);
      const identifier = parts[2] ?? "";
      const isInstagram = identifier.startsWith("@");
      const normalizedPhone = isInstagram ? null : normalizePhone(identifier);
      const validIdentifier =
        (isInstagram && normalizeInstagram(identifier)) ||
        (!isInstagram && normalizedPhone && normalizedPhone.length >= 8);
      let error: string | null = null;
      if (!parts[0]) error = "Guest name is required";
      else if (!Number.isInteger(size) || size < 1 || size > 99)
        error = "Group size must be between 1 and 99";
      else if (!validIdentifier)
        error = "Add a full phone number or an @Instagram username";
      return {
        guestName: parts[0] ?? "",
        expectedGroupSize: Number.isInteger(size) ? size : 0,
        phone: !isInstagram && validIdentifier ? identifier : null,
        instagramUsername: isInstagram && validIdentifier ? identifier : null,
        error,
      };
    });
}
