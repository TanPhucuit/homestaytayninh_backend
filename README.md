# Homestay Tay Ninh Backend

NestJS backend for Homestay Tay Ninh. Deploy this repository to Render.

Frontend repository: `https://github.com/TanPhucuit/homestaytayninh_frontend.git`

## Stack

- NestJS API
- Supabase PostgreSQL via Prisma
- Upstash Redis through `REDIS_URL`
- CloudAMQP RabbitMQ through `RABBITMQ_URL`
- ApiPay payment adapter. Keep `PAYMENT_PROVIDER=mock-apipay` until ApiPay endpoint/signature docs are confirmed.

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

- `AUTH_MODE=supabase`
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

## Demo API Surface

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

Demo RBAC headers are available only while `AUTH_MODE` is not `supabase`:

```bash
x-user-id: u-admin
x-user-role: ADMIN
```

## Database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

Applied Supabase migrations:

- `prisma/migrations/20260526103000_homestay_mvp_schema/migration.sql`
- `prisma/migrations/20260526104000_grant_public_catalog_read_access/migration.sql`
- `prisma/migrations/20260526104500_index_proxy_booking_actor/migration.sql`
- `prisma/migrations/20260526110000_lock_down_connection_health_checks/migration.sql`

The public catalog endpoints `GET /api/homestays` and `GET /api/homestays/:id` read Supabase directly when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured. Public Data API access is read-only through RLS.

When `DATABASE_URL` is configured, booking, payment, owner, staff and admin endpoints persist with server-side Prisma. Without it, the API falls back to its in-memory demo store for local previews and tests.

Set `AUTH_MODE=supabase` on Render so guarded routes verify the Supabase bearer token, bind authenticated email accounts to `user_profiles`, and ignore role headers. New authenticated users are created with `CUSTOMER`; Owner, Owner Staff, Staff and Admin profiles must be created by Admin first. Do not expose `DATABASE_URL` or any Supabase secret key to the frontend.

`GET /api/health` reports `persistence: "postgres"` when writes are connected to PostgreSQL. `GET /api/health/supabase` performs a read-only catalog check; it does not insert health records.

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
