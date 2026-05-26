import { describe, expect, it } from "vitest";
import { DemoStoreService } from "../src/common/demo-store.service";

function makeBooking(store: DemoStoreService) {
  return store.createBooking({
    customerId: "u-customer",
    homestayId: "hs-ba-den",
    roomId: "room-ba-den-family",
    guestName: "Test",
    guestPhone: "090",
    guestCount: 2,
    checkIn: "2026-05-28",
    checkOut: "2026-05-29"
  });
}

describe("booking service ordering", () => {
  it("blocks add-on service before IN_STAY and allows it during IN_STAY", () => {
    const store = new DemoStoreService();
    const booking = makeBooking(store);

    expect(() => store.addServiceToBooking(booking.id, "svc-bbq", 1)).toThrow();

    store.updateBookingStatus(booking.id, "CONFIRMED");
    store.updateBookingStatus(booking.id, "IN_STAY");

    const updated = store.addServiceToBooking(booking.id, "svc-bbq", 2);

    expect(updated.services.at(-1)?.status).toBe("PREPARING");
    expect(updated.serviceTotal).toBe(1_300_000);
    expect(updated.grandTotal).toBe(updated.roomTotal + updated.serviceTotal);
  });

  it("updates service order status to served", () => {
    const store = new DemoStoreService();
    const booking = store.bookings[0];
    const serviceOrder = booking.services[0];

    expect(store.setServiceOrderStatus(booking.id, serviceOrder.id, "SERVED").status).toBe("SERVED");
  });
});
