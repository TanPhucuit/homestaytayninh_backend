import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

type Role = "CUSTOMER" | "OWNER" | "OWNER_STAFF" | "STAFF" | "ADMIN";
type Json = Record<string, unknown>;

const requiredVariables = [
  "TEST_API_URL",
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_PUBLISHABLE_KEY",
  "TEST_ADMIN_EMAIL",
  "TEST_ADMIN_PASSWORD",
  "TEST_STAFF_EMAIL",
  "TEST_STAFF_PASSWORD",
  "TEST_OWNER_EMAIL",
  "TEST_OWNER_PASSWORD",
  "TEST_OWNER_STAFF_EMAIL",
  "TEST_OWNER_STAFF_PASSWORD",
  "TEST_CUSTOMER_EMAIL",
  "TEST_CUSTOMER_PASSWORD",
  "TEST_NEW_CUSTOMER_EMAIL",
  "TEST_NEW_CUSTOMER_PASSWORD",
  "TEST_BANNED_EMAIL",
  "TEST_BANNED_PASSWORD",
  "TEST_ASSIGNED_HOMESTAY_ID",
  "TEST_ASSIGNED_ROOM_ID",
  "TEST_ASSIGNED_SERVICE_ID",
  "TEST_UNASSIGNED_HOMESTAY_ID",
  "TEST_OTHER_CUSTOMER_BOOKING_ID",
  "TEST_OPEN_REPORT_ID"
] as const;

const env = (key: typeof requiredVariables[number]) => process.env[key] ?? "";
const tokens = new Map<Role | "NEW_CUSTOMER" | "BANNED", string>();
let apiUrl = "";

async function tokenFor(email: string, password: string) {
  const client = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false }
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session?.access_token) {
    throw new Error(`Supabase test sign-in failed for ${email}: ${result.error?.message ?? "missing access token"}`);
  }
  return result.data.session.access_token;
}

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

describe("real Supabase business flows", () => {
  beforeAll(async () => {
    const missing = requiredVariables.filter((key) => !env(key));
    if (missing.length) {
      throw new Error(`Real integration tests require an isolated Supabase test environment. Missing: ${missing.join(", ")}`);
    }
    apiUrl = env("TEST_API_URL").replace(/\/$/, "");
    if (apiUrl.includes("homestaytayninh-backend.onrender.com") || process.env.ALLOW_ISOLATED_TEST_MUTATIONS !== "true") {
      throw new Error("Refusing mutation tests: configure a non-production TEST_API_URL and ALLOW_ISOLATED_TEST_MUTATIONS=true.");
    }

    const accounts: Array<[Role | "NEW_CUSTOMER" | "BANNED", string, string]> = [
      ["ADMIN", env("TEST_ADMIN_EMAIL"), env("TEST_ADMIN_PASSWORD")],
      ["STAFF", env("TEST_STAFF_EMAIL"), env("TEST_STAFF_PASSWORD")],
      ["OWNER", env("TEST_OWNER_EMAIL"), env("TEST_OWNER_PASSWORD")],
      ["OWNER_STAFF", env("TEST_OWNER_STAFF_EMAIL"), env("TEST_OWNER_STAFF_PASSWORD")],
      ["CUSTOMER", env("TEST_CUSTOMER_EMAIL"), env("TEST_CUSTOMER_PASSWORD")],
      ["NEW_CUSTOMER", env("TEST_NEW_CUSTOMER_EMAIL"), env("TEST_NEW_CUSTOMER_PASSWORD")],
      ["BANNED", env("TEST_BANNED_EMAIL"), env("TEST_BANNED_PASSWORD")]
    ];
    await Promise.all(accounts.map(async ([key, email, password]) => tokens.set(key, await tokenFor(email, password))));
  });

  it("resolves database roles for authenticated users and provisions only a new customer as CUSTOMER", async () => {
    for (const role of ["ADMIN", "STAFF", "OWNER", "OWNER_STAFF", "CUSTOMER"] as Role[]) {
      const me = await api<{ role: Role }>("/api/auth/me", tokens.get(role)!);
      expect(me.status).toBe(200);
      expect(me.body.role).toBe(role);
    }
    const created = await api<{ role: Role }>("/api/auth/me", tokens.get("NEW_CUSTOMER")!);
    expect(created.status).toBe(200);
    expect(created.body.role).toBe("CUSTOMER");
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
    const directStaffDenied = await api("/api/bookings", tokens.get("OWNER_STAFF")!, {
      method: "POST",
      body: {
        homestayId: env("TEST_UNASSIGNED_HOMESTAY_ID"),
        roomId: env("TEST_ASSIGNED_ROOM_ID"),
        guestName: "Forbidden direct booking",
        guestPhone: "0900000000",
        guestCount: 1,
        checkIn: "2030-06-10",
        checkOut: "2030-06-11"
      }
    });
    expect(directStaffDenied.status).toBe(403);
    expect((await api(`/api/bookings/${env("TEST_OTHER_CUSTOMER_BOOKING_ID")}`, tokens.get("CUSTOMER")!)).status).toBe(403);
  });

  it("persists booking operations and CMS/moderation flows through the real test database", async () => {
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
});
