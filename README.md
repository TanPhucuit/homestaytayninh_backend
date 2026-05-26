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

Apply `prisma/rls.sql` only after confirming which public tables are exposed through Supabase Data API.
