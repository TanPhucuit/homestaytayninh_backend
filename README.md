# Homestay Tay Ninh Backend

NestJS backend for Homestay Tay Ninh. Deploy this repository to Render or another Node host with Redis.

Frontend repository: `https://github.com/TanPhucuit/homestaytayninh_frontend.git`

## Stack

- NestJS API
- Redis as primary persistence and session store through `REDIS_URL`
- Google OAuth id-token verification through `GOOGLE_CLIENT_ID`
- CloudAMQP RabbitMQ through `RABBITMQ_URL`
- ApiPay payment adapter. `PAYMENT_PROVIDER=mock-apipay` remains a temporary payment-provider adapter only until ApiPay endpoint/signature docs are confirmed.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

API: `http://localhost:4000/api`

Local Redis is available through `docker-compose.yml`:

```bash
docker compose up -d redis
```

## Render

Use `render.yaml` or configure manually:

- Build command: `npm install && npm run build`
- Start command: `npm run start:prod`
- Health check: `/api/health`

Required env:

- `WEB_ORIGIN`
- `REDIS_URL`
- `SESSION_TTL_SECONDS`
- `GOOGLE_CLIENT_ID`
- `RABBITMQ_URL`
- `PAYMENT_PROVIDER`
- `APIPAY_ACCESS_KEY`
- `APIPAY_SECRET_KEY`
- `APIPAY_BASE_URL`
- `APIPAY_CREATE_PAYMENT_PATH`
- `APIPAY_RETURN_URL`
- `APIPAY_CALLBACK_URL`

## Auth

Protected endpoints require `Authorization: Bearer <htn_session>`.

Login flow:

1. Frontend performs Google OAuth and receives a Google `id_token`.
2. Frontend posts the token to `POST /api/auth/google-login`.
3. Backend verifies the token using Google `tokeninfo` and `GOOGLE_CLIENT_ID`.
4. Backend creates or links a Redis profile by Google subject/email and stores an app session in Redis.
5. Role authorization is read from Redis profile records. Request headers cannot impersonate a role.

New Google users default to `CUSTOMER`. Admin-created profiles can later link to Google on first login by matching email.

## API Surface

All routes use global prefix `/api`.

Health:

- `GET /api/health`
- `GET /api/health/redis`

Auth:

- `POST /api/auth/google-login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Customer:

- `GET /api/homestays`
- `GET /api/homestays/:id`
- `POST /api/bookings`
- `GET /api/me/bookings`
- `GET /api/bookings/:id`
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

## Redis Data

Redis keys are namespaced by entity, for example `user:<id>`, `homestay:<id>`, `booking:<id>`, `session:<token>` and index sets such as `idx:homestays`, `idx:bookings`, `idx:users`.

Demo presentation data is upserted automatically into Redis on startup while `REDIS_AUTO_SEED` is not `false`. There is no in-memory fallback.

## Integration Tests

`npm test` runs Redis integration tests only when a real isolated test API and real Redis session tokens are provided:

```powershell
$env:ALLOW_ISOLATED_TEST_MUTATIONS="true"
$env:TEST_API_URL="http://localhost:4000"
$env:TEST_ADMIN_SESSION_TOKEN="<token>"
$env:TEST_STAFF_SESSION_TOKEN="<token>"
$env:TEST_OWNER_SESSION_TOKEN="<token>"
$env:TEST_OWNER_STAFF_SESSION_TOKEN="<token>"
$env:TEST_CUSTOMER_SESSION_TOKEN="<token>"
npm test
```

Without those variables the mutation suite is skipped rather than fabricating sessions.

## ApiPay

ApiPay credentials must be configured only on the backend. Do not put access keys, secret keys, or non-public payment configuration in the Next.js frontend.

While `PAYMENT_PROVIDER=mock-apipay`, payment initiation may render a pending checkout state for UI presentation, but callback settlement is intentionally rejected. Only the real `apipay` adapter may accept a payment-provider callback.
