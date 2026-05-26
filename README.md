# Homestay Tay Ninh Backend

NestJS backend for Homestay Tay Ninh. Deploy this repository to Render.

Frontend repository: `https://github.com/TanPhucuit/homestaytayninh_frontend.git`

## Stack

- NestJS API
- Supabase PostgreSQL via Prisma
- Upstash Redis through `REDIS_URL`
- CloudAMQP RabbitMQ through `RABBITMQ_URL`
- ApiPay payment adapter. `PAYMENT_PROVIDER=mock-apipay` remains a temporary payment-provider adapter only until ApiPay endpoint/signature docs are confirmed; it is not used as business-data or authentication fallback and does not accept payment callbacks.

## Run

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

API: `http://localhost:4000/api`

## Render

Use `render.yaml` or configure manually:

- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `npm run start:prod`
- Health check: `/api/health`

Required env:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `WEB_ORIGIN`
- `REDIS_URL`
- `RABBITMQ_URL`
- `PAYMENT_PROVIDER`
- `APIPAY_ACCESS_KEY`
- `APIPAY_SECRET_KEY`
- `APIPAY_BASE_URL`
- `APIPAY_CREATE_PAYMENT_PATH`
- `APIPAY_RETURN_URL`
- `APIPAY_CALLBACK_URL`

## API Surface

All routes use global prefix `/api`.

Health:

- `GET /api/health`

Customer:

- `GET /api/homestays`
- `GET /api/homestays/:id`
- `POST /api/bookings`
- `GET /api/me/bookings`
- `GET /api/bookings/:id`
- `POST /api/bookings/:id/services`
- `POST /api/payments/initiate`
- `GET /api/payments/:bookingId/status`
- `POST /api/payments/callback`

Owner / Owner Staff:

- `GET/POST /api/owner/homestays`
- `PATCH /api/owner/homestays/:id`
- `DELETE /api/owner/homestays/:id`
- `GET/POST /api/owner/homestays/:id/images`
- `PATCH/DELETE /api/owner/homestays/:id/images/:imageId`
- `GET/POST /api/owner/homestays/:id/rooms`
- `PATCH/DELETE /api/owner/homestays/:id/rooms/:roomId`
- `GET/POST /api/owner/homestays/:id/rooms/:roomId/rates`
- `PATCH/DELETE /api/owner/homestays/:id/rooms/:roomId/rates/:rateId`
- `GET/POST /api/owner/homestays/:id/services`
- `PATCH/DELETE /api/owner/homestays/:id/services/:serviceId`
- `GET /api/owner/bookings`
- `PATCH /api/owner/bookings/:id/status`
- `POST /api/owner/proxy-bookings`
- `POST /api/owner/bookings/:id/services`
- `PATCH /api/bookings/:id/services/:serviceOrderId/status`

Staff / Admin:

- `GET /api/admin/dashboard`
- `GET/PATCH /api/admin/users`
- `POST /api/admin/users/:id/ban`
- `POST /api/admin/users/:id/unban`
- `POST /api/admin/users/:id/role`
- `GET/POST/PATCH /api/cms/articles`
- `POST /api/payments/:bookingId/manual-paid`

All protected endpoints require a valid Supabase bearer token. Role authorization is read from the linked `user_profiles` record; request headers cannot impersonate a role.

## Database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

Production presentation data used by the Stitch-aligned UI can be reapplied safely with:

```bash
ALLOW_PRESENTATION_SEED=true PRESENTATION_SEED_TARGET=test npm run seed:presentation

# Production requires an explicit second guard:
ALLOW_PRESENTATION_SEED=true PRESENTATION_SEED_TARGET=production ALLOW_PRODUCTION_DEMO_UPSERT=true npm run seed:presentation
```

The Prisma seed is idempotent and upserts presentation catalog, rooms, rates, images, amenities, services, booking states, payments, CMS articles and reports without deleting existing data. Existing `user_profiles` keep their `role`, `authId` and `banned` values on update. These are persisted records for rendering the UI, not an in-memory fallback. The SQL file `prisma/production_presentation_seed.sql` is kept for manual review/DB-console execution and follows the same no-delete/no-role-overwrite rule.

Applied Supabase migrations:

- `prisma/migrations/20260526103000_homestay_mvp_schema/migration.sql`
- `prisma/migrations/20260526104000_grant_public_catalog_read_access/migration.sql`
- `prisma/migrations/20260526104500_index_proxy_booking_actor/migration.sql`
- `prisma/migrations/20260526110000_lock_down_connection_health_checks/migration.sql`

The public catalog endpoints `GET /api/homestays` and `GET /api/homestays/:id` read Supabase directly when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured. Public Data API access is read-only through RLS.

`DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required at runtime. All catalog, booking, payment, owner, staff and admin flows use Supabase/PostgreSQL data; the server fails startup if persistent storage or authentication configuration is absent.

Guarded routes verify the Supabase bearer token and bind authenticated email accounts to `user_profiles`. New authenticated users are created with `CUSTOMER`; Owner, Owner Staff, Staff and Admin profiles must be assigned in the database through Admin workflows. An existing linked profile keeps its assigned role at login. Do not expose `DATABASE_URL` or any Supabase secret key to the frontend.

`GET /api/health` reports `persistence: "postgres"`. `GET /api/health/supabase` performs a read-only catalog check; it does not insert health records.

## Real Integration Tests

Business-flow tests run only against an isolated Supabase branch or test project and a backend configured for that same database/Auth project. They never use in-memory state or role impersonation headers.

Create the seven test Auth accounts in the isolated Supabase project first. Configure its backend/database and provide `TEST_API_URL`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY` plus email/password pairs for Admin, Staff, Owner, Owner Staff, Customer, a new Customer and a banned Customer. Seed the regular presentation records and isolated RBAC fixtures:

```powershell
npm run seed
$env:ALLOW_ISOLATED_TEST_MUTATIONS="true"
$env:TEST_ASSIGNED_HOMESTAY_ID="hs-ba-den"
$env:TEST_ASSIGNED_ROOM_ID="room-ba-den-family"
$env:TEST_ASSIGNED_SERVICE_ID="svc-bbq"
$env:TEST_UNASSIGNED_HOMESTAY_ID="hs-test-unassigned"
$env:TEST_OTHER_CUSTOMER_BOOKING_ID="bk-test-other"
$env:TEST_OPEN_REPORT_ID="report-test-open"
npm run seed:test
npm test
```

Use the equivalent environment-variable commands for the deployment shell that runs tests. `TEST_NEW_CUSTOMER_EMAIL` must not be pre-seeded as a profile; its first `/api/auth/me` call verifies default `CUSTOMER` provisioning. The test harness refuses the production Render URL and fails fast when test-project credentials are missing.

## ApiPay

ApiPay credentials must be configured only on the backend. Do not put access keys, secret keys, or non-public payment configuration in the Next.js frontend.

Render env for ApiPay:

```bash
PAYMENT_PROVIDER="apipay"
APIPAY_BASE_URL="<ApiPay API origin from provider docs>"
APIPAY_CREATE_PAYMENT_PATH="<create-payment path from provider docs>"
APIPAY_ACCESS_KEY="<ApiPay access key>"
APIPAY_SECRET_KEY="<ApiPay secret key>"
APIPAY_CURRENCY="VND"
APIPAY_RETURN_URL="https://<vercel-domain>/payment/result"
APIPAY_CALLBACK_URL="https://<render-domain>/api/payments/callback"
```

The current adapter sends a server-side JSON create-payment request with `x-access-key` and an HMAC-SHA256 `x-signature` header. Confirm these exact endpoint/header/signature requirements against ApiPay documentation before switching Render from `mock-apipay` to `apipay`.

While `PAYMENT_PROVIDER=mock-apipay`, payment initiation may render a pending checkout state for UI presentation, but callback settlement is intentionally rejected. Only the real `apipay` adapter may accept a payment-provider callback.
