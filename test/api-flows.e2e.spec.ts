import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

type ApiResponse<T> = { status: number; body: T };

describe("business API flows", () => {
  let app: INestApplication;
  let baseUrl: string;
  let bookingId: string;
  let serviceOrderId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  afterAll(async () => {
    await app?.close();
  });

  const request = async <T>(
    path: string,
    options: { method?: string; role?: string; userId?: string; body?: unknown } = {}
  ): Promise<ApiResponse<T>> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.role ? { "x-user-role": options.role } : {}),
        ...(options.userId ? { "x-user-id": options.userId } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    return { status: response.status, body: (await response.json()) as T };
  };

  it("serves health, auth identity, search and detail endpoints", async () => {
    expect((await request<{ ok: boolean }>("/health")).body.ok).toBe(true);

    const me = await request<{ role: string; id: string }>("/auth/me", { role: "CUSTOMER", userId: "u-customer" });
    expect(me.body).toMatchObject({ role: "CUSTOMER", id: "u-customer" });

    const list = await request<Array<{ id: string }>>("/homestays?type=Nh%C3%A0%20nguy%C3%AAn%20c%C4%83n&guests=4&maxPrice=1500000");
    expect(list.body.map((item) => item.id)).toContain("hs-ba-den");

    const detail = await request<{ rooms: unknown[]; services: unknown[] }>("/homestays/hs-ba-den");
    expect(detail.body.rooms.length).toBeGreaterThan(0);
    expect(detail.body.services.length).toBeGreaterThan(0);

    const invalidFilter = await request("/homestays?guests=abc");
    expect(invalidFilter.status).toBe(400);
  });

  it("runs customer booking and payment flow without allowing identity override", async () => {
    const created = await request<{ id: string; customerId: string; status: string; grandTotal: number }>("/bookings", {
      method: "POST",
      role: "CUSTOMER",
      userId: "u-customer",
      body: {
        customerId: "u-admin",
        homestayId: "hs-ba-den",
        roomId: "room-ba-den-family",
        guestName: "Khách thử nghiệm",
        guestPhone: "0901000001",
        guestCount: 2,
        checkIn: "2026-06-01",
        checkOut: "2026-06-03"
      }
    });
    expect(created.status).toBe(201);
    expect(created.body.customerId).toBe("u-customer");
    expect(created.body.status).toBe("PENDING");
    bookingId = created.body.id;

    const payment = await request<{ status: string; checkoutUrl: string }>("/payments/initiate", {
      method: "POST",
      role: "CUSTOMER",
      userId: "u-customer",
      body: { bookingId }
    });
    expect(payment.body.status).toBe("PENDING");
    expect(payment.body.checkoutUrl).toContain("mock_");

    const callback = await request<{ id: string; status: string }>("/payments/callback", {
      method: "POST",
      body: { bookingId, status: "PAID", providerRef: `mock_${bookingId}` }
    });
    const repeatedCallback = await request<{ id: string; status: string }>("/payments/callback", {
      method: "POST",
      body: { bookingId, status: "PAID", providerRef: `mock_${bookingId}` }
    });
    expect(callback.body.status).toBe("PAID");
    expect(repeatedCallback.body.id).toBe(callback.body.id);

    const status = await request<{ status: string }>(`/payments/${bookingId}/status`, {
      role: "CUSTOMER",
      userId: "u-customer"
    });
    expect(status.body.status).toBe("PAID");

    const addOn = await request<{ services: Array<{ name: string }> }>("/bookings/bk-demo-1/services", {
      method: "POST",
      role: "CUSTOMER",
      userId: "u-customer",
      body: { serviceId: "svc-trekking", quantity: 1 }
    });
    expect(addOn.status).toBe(201);
    expect(addOn.body.services.at(-1)!.name).toBe("Trekking Núi Bà");
  });

  it("runs owner staff booking state and in-stay service workflow", async () => {
    const proxy = await request<{ proxyCreatedBy: string; status: string }>("/owner/proxy-bookings", {
      method: "POST",
      role: "OWNER_STAFF",
      userId: "u-owner-staff",
      body: {
        homestayId: "hs-trang-bang",
        roomId: "room-trang-bang-deluxe",
        guestName: "Khách gọi điện",
        guestPhone: "0909000000",
        guestCount: 2,
        checkIn: "2026-06-04",
        checkOut: "2026-06-05"
      }
    });
    expect(proxy.body).toMatchObject({ proxyCreatedBy: "u-owner-staff", status: "PENDING" });

    for (const status of ["CONFIRMED", "IN_STAY"] as const) {
      const updated = await request<{ status: string }>(`/owner/bookings/${bookingId}/status`, {
        method: "PATCH",
        role: "OWNER_STAFF",
        userId: "u-owner-staff",
        body: { status }
      });
      expect(updated.body.status).toBe(status);
    }

    const service = await request<{ services: Array<{ id: string; status: string }> }>(`/owner/bookings/${bookingId}/services`, {
      method: "POST",
      role: "OWNER_STAFF",
      userId: "u-owner-staff",
      body: { serviceId: "svc-bbq", quantity: 2 }
    });
    serviceOrderId = service.body.services.at(-1)!.id;
    expect(service.body.services.at(-1)!.status).toBe("PREPARING");

    const served = await request<{ status: string }>(`/bookings/${bookingId}/services/${serviceOrderId}/status`, {
      method: "PATCH",
      role: "OWNER_STAFF",
      userId: "u-owner-staff",
      body: { status: "SERVED" }
    });
    expect(served.body.status).toBe("SERVED");

    const completed = await request<{ status: string }>(`/owner/bookings/${bookingId}/status`, {
      method: "PATCH",
      role: "OWNER_STAFF",
      userId: "u-owner-staff",
      body: { status: "COMPLETED" }
    });
    expect(completed.body.status).toBe("COMPLETED");
  });

  it("enforces validation and RBAC boundaries", async () => {
    const invalidDates = await request("/bookings", {
      method: "POST",
      role: "CUSTOMER",
      userId: "u-customer",
      body: { homestayId: "hs-ba-den", roomId: "room-ba-den-family", checkIn: "2026-06-03", checkOut: "2026-06-01" }
    });
    expect(invalidDates.status).toBe(400);

    const oversizedBooking = await request("/bookings", {
      method: "POST",
      role: "CUSTOMER",
      userId: "u-customer",
      body: { homestayId: "hs-ba-den", roomId: "room-ba-den-family", guestCount: 99, checkIn: "2026-06-01", checkOut: "2026-06-02" }
    });
    expect(oversizedBooking.status).toBe(400);

    const invalidQuantity = await request("/bookings/bk-demo-1/services", {
      method: "POST",
      role: "CUSTOMER",
      userId: "u-customer",
      body: { serviceId: "svc-bbq", quantity: 0 }
    });
    expect(invalidQuantity.status).toBe(400);

    const invalidPayment = await request("/payments/callback", {
      method: "POST",
      body: { bookingId: "bk-demo-1", status: "HACKED" }
    });
    expect(invalidPayment.status).toBe(400);

    const staffBooking = await request(`/bookings/${bookingId}`, { role: "STAFF", userId: "u-staff" });
    expect(staffBooking.status).toBe(403);

    const anotherCustomer = await request(`/bookings/${bookingId}`, { role: "CUSTOMER", userId: "u-other" });
    expect(anotherCustomer.status).toBe(403);

    const ownerStaffInventoryMutation = await request("/owner/homestays/hs-ba-den/rooms", {
      method: "POST",
      role: "OWNER_STAFF",
      userId: "u-owner-staff",
      body: { name: "Không được tạo" }
    });
    expect(ownerStaffInventoryMutation.status).toBe(403);
  });

  it("runs owner inventory, staff CMS/moderation and admin management APIs", async () => {
    const room = await request<{ id: string }>("/owner/homestays/hs-ba-den/rooms", {
      method: "POST",
      role: "OWNER",
      userId: "u-owner",
      body: { name: "Phòng test API", pricePerNight: 950000, capacity: 2, totalUnits: 1 }
    });
    expect(room.status).toBe(201);

    const service = await request<{ id: string; active: boolean }>("/owner/homestays/hs-ba-den/services", {
      method: "POST",
      role: "OWNER",
      userId: "u-owner",
      body: { name: "Dịch vụ test API", unitPrice: 120000, included: false }
    });
    const serviceUpdated = await request<{ active: boolean }>(`/owner/homestays/hs-ba-den/services/${service.body.id}`, {
      method: "PATCH",
      role: "OWNER",
      userId: "u-owner",
      body: { active: false }
    });
    expect(serviceUpdated.body.active).toBe(false);

    const article = await request<{ id: string; status: string }>("/cms/articles", {
      method: "POST",
      role: "STAFF",
      userId: "u-staff",
      body: { title: "Tin API", slug: "tin-api", content: "Nội dung", status: "DRAFT" }
    });
    expect(article.body.status).toBe("DRAFT");
    const published = await request<{ status: string }>(`/cms/articles/${article.body.id}/publish`, {
      method: "POST",
      role: "STAFF",
      userId: "u-staff"
    });
    expect(published.body.status).toBe("PUBLISHED");
    const unpublished = await request<{ status: string }>(`/cms/articles/${article.body.id}/unpublish`, {
      method: "POST",
      role: "STAFF",
      userId: "u-staff"
    });
    expect(unpublished.body.status).toBe("DRAFT");

    const invalidArticle = await request("/cms/articles", {
      method: "POST",
      role: "STAFF",
      userId: "u-staff",
      body: { title: "Sai trạng thái", status: "REMOVED" }
    });
    expect(invalidArticle.status).toBe(400);

    const deleted = await request<{ id: string }>(`/cms/articles/${article.body.id}`, {
      method: "DELETE",
      role: "STAFF",
      userId: "u-staff"
    });
    expect(deleted.body.id).toBe(article.body.id);

    const reports = await request<Array<{ id: string }>>("/admin/reports", { role: "STAFF", userId: "u-staff" });
    const resolved = await request<{ status: string }>(`/admin/reports/${reports.body[0].id}/resolve`, {
      method: "POST",
      role: "STAFF",
      userId: "u-staff"
    });
    expect(resolved.body.status).toBe("RESOLVED");

    const user = await request<{ id: string; role: string }>("/admin/users", {
      method: "POST",
      role: "ADMIN",
      userId: "u-admin",
      body: { name: "Owner API", email: "owner-api@homestay.vn", role: "OWNER" }
    });
    expect(user.body.role).toBe("OWNER");
    const banned = await request<{ banned: boolean }>(`/admin/users/${user.body.id}/ban`, {
      method: "POST",
      role: "ADMIN",
      userId: "u-admin"
    });
    expect(banned.body.banned).toBe(true);
    const assignedRole = await request<{ role: string }>(`/admin/users/${user.body.id}/role`, {
      method: "POST",
      role: "ADMIN",
      userId: "u-admin",
      body: { role: "OWNER_STAFF" }
    });
    expect(assignedRole.body.role).toBe("OWNER_STAFF");
    const unbanned = await request<{ banned: boolean }>(`/admin/users/${user.body.id}/unban`, {
      method: "POST",
      role: "ADMIN",
      userId: "u-admin"
    });
    expect(unbanned.body.banned).toBe(false);

    const staffDashboard = await request("/admin/dashboard", { role: "STAFF", userId: "u-staff" });
    expect(staffDashboard.status).toBe(403);

    const dashboard = await request<{ transactions: number; revenue: number }>("/admin/dashboard", {
      role: "ADMIN",
      userId: "u-admin"
    });
    expect(dashboard.body.transactions).toBeGreaterThan(0);
    expect(dashboard.body.revenue).toBeGreaterThan(0);
  });
});
