# Homestay Tay Ninh Backend

NestJS backend for Homestay Tay Ninh. Deploy this repository to Render.

Frontend repository: `https://github.com/TanPhucuit/homestaytayninh.git`

## Stack

- NestJS API
- Supabase PostgreSQL via Prisma
- Upstash Redis through `REDIS_URL`
- CloudAMQP RabbitMQ through `RABBITMQ_URL`
- Mock ApiPay adapter until real credentials are available

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

- `DATABASE_URL`
- `DIRECT_URL`
- `WEB_ORIGIN`
- `REDIS_URL`
- `RABBITMQ_URL`
- `PAYMENT_PROVIDER`

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
- `GET/POST /api/owner/homestays/:id/rooms`
- `PATCH /api/owner/homestays/:id/rooms/:roomId`
- `GET/POST /api/owner/homestays/:id/services`
- `PATCH /api/owner/homestays/:id/services/:serviceId`
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

Demo RBAC headers:

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

The public catalog endpoints `GET /api/homestays` and `GET /api/homestays/:id` read Supabase directly when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured. Public Data API access is read-only through RLS.

Booking, payment, owner, staff and admin mutation endpoints currently retain the in-memory demo store until server-side persistence is wired with `SUPABASE_SECRET_KEY` or Prisma database credentials. Do not expose the Supabase secret key to the frontend.
