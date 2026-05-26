import { beforeAll, describe, expect, it } from "vitest";

type Role = "CUSTOMER" | "OWNER" | "OWNER_STAFF" | "STAFF" | "ADMIN";
type Json = Record<string, unknown>;

const requiredVariables = [
  "TEST_API_URL",
  "TEST_ADMIN_SESSION_TOKEN",
  "TEST_STAFF_SESSION_TOKEN",
  "TEST_OWNER_SESSION_TOKEN",
  "TEST_OWNER_STAFF_SESSION_TOKEN",
  "TEST_CUSTOMER_SESSION_TOKEN",
  "TEST_BANNED_SESSION_TOKEN",
  "TEST_ASSIGNED_HOMESTAY_ID",
  "TEST_ASSIGNED_ROOM_ID",
  "TEST_ASSIGNED_SERVICE_ID",
  "TEST_UNASSIGNED_HOMESTAY_ID",
  "TEST_OTHER_CUSTOMER_BOOKING_ID",
  "TEST_OPEN_REPORT_ID"
] as const;

const env = (key: typeof requiredVariables[number]) => process.env[key] ?? "";
const hasRedisTestEnv = requiredVariables.every((key) => env(key));
const describeIf = hasRedisTestEnv ? describe : describe.skip;
const tokens = new Map<Role | "BANNED", string>();
let apiUrl = "";

async function api<T>(path: string, token: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; body: T }> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body)
  });
  return { status: response.status, body: (await response.json()) as T };
}

describeIf("real Redis business flows", () => {
  beforeAll(async () => {
    apiUrl = env("TEST_API_URL").replace(/\/$/, "");
    if (apiUrl.includes("homestaytayninh-backend.onrender.com") || process.env.ALLOW_ISOLATED_TEST_MUTATIONS !== "true") {
      throw new Error("Refusing mutation tests: configure a non-production TEST_API_URL and ALLOW_ISOLATED_TEST_MUTATIONS=true.");
    }
    tokens.set("ADMIN", env("TEST_ADMIN_SESSION_TOKEN"));
    tokens.set("STAFF", env("TEST_STAFF_SESSION_TOKEN"));
    tokens.set("OWNER", env("TEST_OWNER_SESSION_TOKEN"));
    tokens.set("OWNER_STAFF", env("TEST_OWNER_STAFF_SESSION_TOKEN"));
    tokens.set("CUSTOMER", env("TEST_CUSTOMER_SESSION_TOKEN"));
    tokens.set("BANNED", env("TEST_BANNED_SESSION_TOKEN"));
  });

  it("resolves Redis profile roles for authenticated session tokens", async () => {
    for (const role of ["ADMIN", "STAFF", "OWNER", "OWNER_STAFF", "CUSTOMER"] as Role[]) {
      const me = await api<{ role: Role }>("/api/auth/me", tokens.get(role)!);
      expect(me.status).toBe(200);
      expect(me.body.role).toBe(role);
    }
    expect((await api("/api/auth/me", tokens.get("BANNED")!)).status).toBe(403);
  });

  it("allows admin across portals and prevents staff from moderating an administrator", async () => {
    const admin = await api<{ id: string }>("/api/auth/me", tokens.get("ADMIN")!);
    expect((await api("/api/admin/dashboard", tokens.get("ADMIN")!)).status).toBe(200);
    expect((await api("/api/owner/homestays", tokens.get("ADMIN")!)).status).toBe(200);
    expect((await api("/api/cms/articles", tokens.get("ADMIN")!)).status).toBe(200);
    const denied = await api(`/api/admin/users/${admin.body.id}/ban`, tokens.get("STAFF")!, { method: "POST" });
    expect(denied.status).toBe(403);
  });

  it("enforces owner, owner-staff and customer data boundaries", async () => {
    const ownerDenied = await api(`/api/owner/homestays/${env("TEST_UNASSIGNED_HOMESTAY_ID")}`, tokens.get("OWNER")!, {
      method: "PATCH",
      body: { name: "Must not change" }
    });
    expect(ownerDenied.status).toBe(403);

    const staffDenied = await api("/api/owner/proxy-bookings", tokens.get("OWNER_STAFF")!, {
      method: "POST",
      body: {
        homestayId: env("TEST_UNASSIGNED_HOMESTAY_ID"),
        roomId: env("TEST_ASSIGNED_ROOM_ID"),
        guestName: "Forbidden booking",
        guestPhone: "0900000000",
        guestCount: 1,
        checkIn: "2030-06-10",
        checkOut: "2030-06-11"
      }
    });
    expect(staffDenied.status).toBe(403);
    expect((await api(`/api/bookings/${env("TEST_OTHER_CUSTOMER_BOOKING_ID")}`, tokens.get("CUSTOMER")!)).status).toBe(403);
  });

  it("persists booking operations and CMS/moderation flows through Redis", async () => {
    const suffix = Date.now();
    const booking = await api<{ id: string; status: string }>("/api/bookings", tokens.get("CUSTOMER")!, {
      method: "POST",
      body: {
        homestayId: env("TEST_ASSIGNED_HOMESTAY_ID"),
        roomId: env("TEST_ASSIGNED_ROOM_ID"),
        guestName: `Integration Customer ${suffix}`,
        guestPhone: "0901000001",
        guestCount: 1,
        checkIn: "2030-07-01",
        checkOut: "2030-07-02"
      }
    });
    expect(booking.status).toBe(201);
    expect(Number((booking.body as Json).taxTotal)).toBeGreaterThan(0);
    expect(Number((booking.body as Json).grandTotal)).toBe(
      Number((booking.body as Json).roomTotal) + Number((booking.body as Json).serviceTotal) + Number((booking.body as Json).taxTotal)
    );
    for (const status of ["CONFIRMED", "IN_STAY"] as const) {
      const changed = await api<{ status: string }>(`/api/owner/bookings/${booking.body.id}/status`, tokens.get("OWNER_STAFF")!, {
        method: "PATCH",
        body: { status }
      });
      expect(changed.body.status).toBe(status);
    }
    const service = await api<{ services: Array<{ status: string }> }>(`/api/owner/bookings/${booking.body.id}/services`, tokens.get("OWNER_STAFF")!, {
      method: "POST",
      body: { serviceId: env("TEST_ASSIGNED_SERVICE_ID"), quantity: 1 }
    });
    expect(service.status).toBe(201);
    expect(service.body.services.at(-1)?.status).toBe("PREPARING");

    const article = await api<{ id: string; status: string }>("/api/cms/articles", tokens.get("STAFF")!, {
      method: "POST",
      body: { title: `Integration ${suffix}`, slug: `integration-${suffix}`, content: "Real test record", status: "DRAFT" }
    });
    expect(article.status).toBe(201);
    expect((await api(`/api/cms/articles/${article.body.id}/publish`, tokens.get("STAFF")!, { method: "POST" })).status).toBe(201);
    expect((await api(`/api/cms/articles/${article.body.id}`, tokens.get("STAFF")!, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/api/admin/reports/${env("TEST_OPEN_REPORT_ID")}/resolve`, tokens.get("STAFF")!, { method: "POST" })).status).toBe(201);
  });

  it("filters catalog by amenity and rejects invalid date ranges", async () => {
    const ok = await fetch(`${apiUrl}/api/homestays?guests=1&amenity=Wifi`);
    expect(ok.status).toBe(200);
    const invalid = await fetch(`${apiUrl}/api/homestays?checkIn=2030-07-03&checkOut=2030-07-01`);
    expect(invalid.status).toBe(400);
  });
});
