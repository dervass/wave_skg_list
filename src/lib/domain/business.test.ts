import { describe, expect, it } from "vitest";

import {
  attributionOverrideIsValid,
  calculateSettlement,
  canChangeAttribution,
  canNormallyEditEvent,
  canViewFinancials,
  duplicateReasons,
  findDuplicateCandidates,
  parseReservationLines,
  sumUniqueOperations,
} from "@/lib/domain/business";

describe("settlement rules", () => {
  it("calculates ten PR attendees", () => {
    const result = calculateSettlement([
      { delta: 10, revenueEligible: true, prId: "pr-1", prName: "Alex" },
    ]);
    expect(result.venuePaymentCents).toBe(6000);
    expect(result.totalPrCommissionCents).toBe(2500);
    expect(result.retainedCents).toBe(3500);
  });

  it("calculates ten direct attendees without commission", () => {
    const result = calculateSettlement([
      { delta: 10, revenueEligible: true, prId: null },
    ]);
    expect(result.venuePaymentCents).toBe(6000);
    expect(result.totalPrCommissionCents).toBe(0);
  });

  it("uses actual arrivals, not reserved group size", () => {
    const result = calculateSettlement([
      { delta: 3, revenueEligible: true, prId: "pr-1" },
    ]);
    expect(result.eligibleAttendees).toBe(3);
    expect(result.venuePaymentCents).toBe(1800);
  });

  it("no-shows contribute no ledger entries and therefore zero", () => {
    expect(calculateSettlement([]).venuePaymentCents).toBe(0);
  });

  it("applies corrections to attendance and commission", () => {
    const result = calculateSettlement([
      { delta: 5, revenueEligible: true, prId: "pr-1" },
      { delta: -2, revenueEligible: true, prId: "pr-1" },
    ]);
    expect(result.eligibleAttendees).toBe(3);
    expect(result.totalPrCommissionCents).toBe(750);
  });

  it("does not charge for non-revenue guests", () => {
    const result = calculateSettlement([
      { delta: 4, revenueEligible: false, prId: null },
    ]);
    expect(result.nonRevenueAttendees).toBe(4);
    expect(result.venuePaymentCents).toBe(0);
  });
});

describe("duplicate detection", () => {
  const base = {
    guest_name: "Elena Georgiou",
    phone: "+30 694 555 7629",
    instagram_username: "@elenag",
  };

  it("detects matching identifiers in the same candidate set", () => {
    expect(
      duplicateReasons(
        {
          guest_name: "Elena Georgiu",
          phone: "+30 694 555 7629",
          instagram_username: null,
        },
        base,
      ),
    ).toEqual(expect.arrayContaining(["phone", "similar_name"]));
  });

  it("only flags duplicates within the same event", () => {
    const matches = findDuplicateCandidates("event-a", base, [
      { id: "1", event_id: "event-a", ...base },
      { id: "2", event_id: "event-b", ...base },
    ]);
    expect(matches.map((match) => match.reservation.id)).toEqual(["1"]);
  });
});

describe("bulk parser", () => {
  it("parses Instagram reservation lines", () => {
    const rows = parseReservationLines(
      "Elena Georgiou, 5, +30 694 555 7629\nNikos Pappas, 3, @nikosp",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      expectedGroupSize: 5,
      phone: "+30 694 555 7629",
    });
    expect(rows[1]).toMatchObject({ instagramUsername: "@nikosp", error: null });
  });
});

describe("authorization and integrity guards", () => {
  it("locks attribution after the first check-in", () => {
    expect(canChangeAttribution(null)).toBe(true);
    expect(canChangeAttribution("2026-07-30T20:00:00Z")).toBe(false);
  });

  it("requires a written attribution override reason", () => {
    expect(attributionOverrideIsValid(true, "")).toBe(false);
    expect(attributionOverrideIsValid(true, "PR confirmed in DMs")).toBe(true);
  });

  it("prevents duplicate online or offline operations", () => {
    const key = "98091bc2-e4bf-4fd7-9870-11fdcd35d235";
    expect(
      sumUniqueOperations([
        { idempotencyKey: key, delta: 3 },
        { idempotencyKey: key, delta: 3 },
      ]),
    ).toBe(3);
  });

  it("does not expose financial settings to door staff", () => {
    expect(canViewFinancials("door")).toBe(false);
    expect(canViewFinancials("organizer")).toBe(true);
  });

  it("rejects normal edits for closed events", () => {
    expect(canNormallyEditEvent("organizer", "closed")).toBe(false);
    expect(canNormallyEditEvent("organizer", "open")).toBe(true);
  });
});
