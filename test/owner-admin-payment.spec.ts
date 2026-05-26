import { describe, expect, it } from "vitest";
import { DemoStoreService } from "../src/common/demo-store.service";

describe("owner/admin/payment store operations", () => {
  it("creates and updates rooms and services for owner management", () => {
    const store = new DemoStoreService();

    const room = store.createRoom("hs-ba-den", {
      name: "Deluxe View Nui",
      pricePerNight: 1_200_000,
      capacity: 3,
      totalUnits: 2
    });
    expect(room.id).toMatch(/^room-/);
    expect(store.updateRoom("hs-ba-den", room.id, { active: false }).active).toBe(false);

    const service = store.createService("hs-ba-den", {
      name: "Set BBQ dem",
      unitPrice: 850_000,
      included: false
    });
    expect(service.id).toMatch(/^svc-/);
    expect(store.updateService("hs-ba-den", service.id, { active: false }).active).toBe(false);
  });

  it("assigns roles, bans users, and records manual payment", () => {
    const store = new DemoStoreService();

    const owner = store.createUser({ name: "New Owner", email: "new-owner@homestay.vn", role: "OWNER" });
    expect(owner.role).toBe("OWNER");
    expect(store.users.some((user) => user.email === "new-owner@homestay.vn")).toBe(true);
    expect(store.setRole("u-customer", "OWNER_STAFF").role).toBe("OWNER_STAFF");
    expect(store.banUser("u-customer", true).banned).toBe(true);
    expect(store.banUser("u-customer", false).banned).toBe(false);

    const payment = store.upsertPayment("bk-demo-1", {
      provider: "manual",
      providerRef: "manual_bk_demo_1",
      status: "PAID",
      amount: store.bookings[0].grandTotal
    });

    expect(payment.provider).toBe("manual");
    expect(payment.status).toBe("PAID");
  });
});
