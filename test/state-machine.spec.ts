import { describe, expect, it } from "vitest";
import { DemoStoreService } from "../src/common/demo-store.service";

describe("booking state machine", () => {
  it("allows the happy path and blocks invalid transitions", () => {
    const store = new DemoStoreService();
    const booking = store.createBooking({
      customerId: "u-customer",
      homestayId: "hs-ba-den",
      roomId: "room-ba-den-family",
      guestName: "Test",
      guestPhone: "090",
      guestCount: 2,
      checkIn: "2026-05-28",
      checkOut: "2026-05-29"
    });

    expect(store.updateBookingStatus(booking.id, "CONFIRMED").status).toBe("CONFIRMED");
    expect(store.updateBookingStatus(booking.id, "IN_STAY").status).toBe("IN_STAY");
    expect(() => store.updateBookingStatus(booking.id, "PENDING")).toThrow();
    expect(() => store.updateBookingStatus(booking.id, "CANCELLED")).toThrow();
    expect(store.updateBookingStatus(booking.id, "COMPLETED").status).toBe("COMPLETED");
  });
});
