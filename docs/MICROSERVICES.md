# RailGrid — Microservices Deep Dive

> Resume / interview companion for the **IRCTC-style railway booking platform** in this repository.
> Everything below was verified against the source tree and cross-referenced with `deep_dive.pdf`,
> `interview_cheat_sheet.pdf`, `interview_qa (2).pdf`, and `resume (2).pdf`.

---

## Table of Contents

1. [Project Snapshot](#1-project-snapshot)
2. [Architecture Overview](#2-architecture-overview)
3. [The Services (primary implementation)](#3-the-services-primary-implementation)
4. [End-to-End Data Flows](#4-end-to-end-data-flows)
5. [Kafka Topic Catalog](#5-kafka-topic-catalog)
6. [Design Patterns → Code Map](#6-design-patterns--code-map)
7. [Cross-Cutting Concerns](#7-cross-cutting-concerns)
8. [v2: The `packages/` NestJS Workspace](#8-v2-the-packages-nestjs-workspace)
9. [Talking Points & Metrics to Quote](#9-talking-points--metrics-to-quote)
10. [Known Gaps & Technical Debt](#10-known-gaps--technical-debt)

---

## 1. Project Snapshot

**RailGrid** is a production-grade, event-driven railway booking backend (an IRCTC clone) built to demonstrate
enterprise microservice patterns: **database-per-service, API gateway, saga orchestration, event-driven CQRS,
distributed locking, and full observability**.

| Layer | Technology |
|---|---|
| Services | Node.js ≥ 20 — Express.js 5 (primary), NestJS 10 + TypeScript (v2 `packages/`) |
| Databases | PostgreSQL 15 — **one database per service** via Prisma 7 (primary) / Drizzle (v2) |
| Cache / locks | Redis Stack (RediSearch + ReJSON) — sessions, OTP, rate limits, distributed seat locks |
| Message bus | Apache Kafka (Confluent 7.5) + KafkaJS, Schema Registry, Kafka UI |
| Search | Elasticsearch 8.12 + Kibana (read model, fed only by Kafka events) |
| Payments | Razorpay (order creation, HMAC signature + webhook verification, refunds) |
| Email | SendGrid (Kafka consumer worker) |
| Auth | JWT access/refresh in HTTP-only cookies, OTP via email, Google OAuth, bcrypt(12) |
| Observability | Prometheus, Grafana, OpenTelemetry, correlation IDs, structured logging |
| Frontend | React 18 + Vite 6 + Zustand + Tailwind (port 3000, proxies `/api` → gateway) |
| Tooling | pnpm workspaces, Docker Compose, GitHub Actions CI, Jest, k6 load tests |

### Port map

| Service | Port | Direct URL |
|---|---|---|
| Frontend (Vite) | 3000 | http://localhost:3000 |
| **API Gateway** | **4000** | http://localhost:4000 |
| **User Service** | **4001** | http://localhost:4001 |
| **Search Service** | **4002** | http://localhost:4002 |
| **Admin Service** | **4003** | http://localhost:4003 |
| **Notification Service** | **4004** | Kafka-only worker (no HTTP routes) |
| **Booking Service** | **4005** | http://localhost:4005 |
| **Payment Service** | **4006** | http://localhost:4006 |
| **Inventory Service** | **4007** | http://localhost:4007 |

| Infrastructure | Port(s) |
|---|---|
| PostgreSQL 15 / pgAdmin | 5432 / 8081 |
| Redis Stack / RedisInsight | 6379 / 8001 |
| Zookeeper / Kafka (internal / host) | 2181 / 9092 / 9093 |
| Schema Registry / Kafka UI | 8082 → 8081 / 8080 |
| Elasticsearch / Kibana | 9200 / 5601 |
| Prometheus / Grafana | 9090 / 3001 → 3000 |

> Ports verified in each service's `src/config/index.js` and `docker-compose.yml:123-201`.

### Two implementations in one repo

| | **Primary (root-level)** | **v2 (`packages/`)** |
|---|---|---|
| Language / framework | JavaScript ESM, Express.js 5 | TypeScript, NestJS 10 |
| ORM | Prisma 7 (per-service `prisma/schema.prisma`) | Drizzle ORM + `postgres` driver |
| Shared code | `shared/` (topic constants, `withDLQ`) | `@irctc/shared` (bootstrap, guards, metrics, outbox, …) |
| Workspace | not in pnpm workspace (standalone `npm run dev` per service) | pnpm workspace (`pnpm-workspace.yaml`) |
| Deployed by | manual / README instructions | **`docker-compose.yml` builds `packages/*/Dockerfile`** |
| Described in | README + all four PDFs + resume | docker-compose + CI (`.github/workflows/ci.yml`) |

Both implement the same domain, ports, and Kafka topics. The primary implementation is documented below;
[v2](#8-v2-the-packages-nestjs-workspace) is covered in section 8.

---

## 2. Architecture Overview

```
                         ┌──────────────────────────┐
                         │  Frontend (React/Zustand)│  :3000
                         └────────────┬─────────────┘
                                      │ /api/* (cookie JWT)
                         ┌────────────▼─────────────┐
                         │      API Gateway  :4000  │
                         │ JWT · rate limit ·       │
                         │ circuit breaker · proxy  │
                         └─┬───┬───┬───┬───┬───┬──┬─┘
            ┌──────────────┘   │   │   │   │   │  └──────────────┐
            ▼                  ▼   │   ▼   │   ▼                 ▼
     ┌────────────┐  ┌──────────┐ │ ┌────────────┐  ┌──────────────┐ ┌──────────────┐
     │ User 4001  │  │Search 4002│ │ │Admin 4003  │  │ Booking 4005 │ │ Payment 4006 │
     └─────┬──────┘  └────┬─────┘ │ └─────┬──────┘  └──┬───┬───┬───┘ └──────┬───────┘
           │              │       │       │            │   │   │             │
           │              │       │       │   saga REST│   │   │saga REST    │ webhook
           │              │       │       ▼            ▼   │   ▼             │
           │              │       │  ┌──────────────┐      │ ┌──────────────┐│
           │              │       │  │Inventory 4007│◄─────┘ │ Notification ││
           │              │       │  └──────┬───────┘        │    4004      ││
           │              │       │         │                │ (Kafka only) ││
           │              │       │         │                └──────▲───────┘│
           ▼              ▼       ▼         ▼                       │        │
        ┌────────────────────────────────────────┐    Kafka events   │        │
        │            Apache Kafka                │───────────────────┘        │
        │  (+ Schema Registry, Kafka UI, DLQs)   │◄───────────────────────────┘
        └───┬─────────────┬─────────────┬────────┘
            │             │             │
   ┌────────▼───┐  ┌──────▼─────┐ ┌─────▼──────────────┐
   │ PostgreSQL │  │Redis Stack │ │ Elasticsearch      │
   │ 5 databases│  │ locks/cache│ │ (search read model)│
   └────────────┘  └────────────┘ └────────────────────┘
```

### Core principles

- **Single entrypoint.** The frontend only ever talks to `:4000`. The gateway validates the JWT from the
  `accessToken` cookie, injects `x-user-id`, applies sliding-window rate limits, and proxies with a
  per-service circuit breaker.
- **Database-per-service.** `infra/postgres/init.sql` creates `user_service_database`,
  `admin_service_database`, `inventory_service_database`, `booking_service_database`,
  `payment_service_database`. No service queries another's tables — cross-context reads go through that
  service's REST API (booking → user/admin for notification enrichment) or through Kafka events
  (search → Elasticsearch).
- **Sync for commands, async for facts.** REST for the request path (booking → inventory/payment),
  Kafka for anything that is "something happened" (payment succeeded, schedule created, booking confirmed).
- **Notification service has no HTTP API** — it is a pure Kafka consumer that sends SendGrid email.
- **Search never touches PostgreSQL** — it builds and maintains its own Elasticsearch indices from events.

### Service dependency chains (`docker-compose.yml`)

```
api-gateway:          [redis]
user-service:         [postgres, redis, kafka]
search-service:       [elasticsearch, kafka]
admin-service:        [postgres, kafka]
notification-service: [kafka]
booking-service:      [postgres, redis, kafka]
payment-service:      [postgres, kafka]
inventory-service:    [postgres, redis, kafka]
```

Observations worth quoting:
- Notification has **no database**; Search has **no PostgreSQL**.
- Every service except the gateway depends on Kafka (gateway needs only Redis for rate limits).
- `depends_on` orders startup, not readiness — hence `withRetry` (3 attempts, `200 * 2^(attempt-1)` ms,
  no retry on 4xx) on every inter-service HTTP client.

### Inter-service communication matrix

| Caller → Callee | Mode | Transport | Auth |
|---|---|---|---|
| Frontend → Gateway | sync | HTTP (`/api/*`, cookie) | JWT cookie |
| Gateway → each service | sync | HTTP proxy (path-strip) | JWT verified at gateway → `x-user-id`; public routes pass-through |
| Booking → Inventory | sync | REST `GET/POST .../schedules|seats` | `x-internal-service-key` |
| Booking → Payment | sync | REST `/orders`, `/refunds` | `x-internal-service-key` |
| Booking → User / Admin | sync | REST `/user/internal/:id`, `/station/internal/:id` | `x-internal-service-key` |
| Payment → Razorpay | sync | HTTPS (SDK) | API keys |
| Admin → Search / Inventory | async | Kafka `admin.*` | — |
| Inventory → Search | async | Kafka `inventory.seat-availability-updated` | — |
| Payment → Booking | async | Kafka `payment.success` / `payment.failed` | — |
| Booking → Notification | async | Kafka `booking.*` | — |
| User → Notification | async | Kafka `notification.*` | — |

The only outbound service-to-service HTTP calls in the whole system live in
`booking-service/src/services/{inventoryClient,paymentClient,userClient,stationClient}.js`.

---

## 3. The Services (primary implementation)

### 3.1 API Gateway — `:4000` (`api-gateway/`)

The single entrypoint: routing, auth, rate limiting, and fault isolation.

- **Middleware order** (`src/index.js:16-35`): CORS → Helmet → request logger → **conditional body parser**
  (the Razorpay webhook path `/api/payments/webhooks/razorpay` gets `express.raw`, everything else
  `express.json({limit:'10mb'})`) → cookie-parser → morgan (dev).
- **Proxy** (`src/services/proxy.js`): path rewrite strips only the **first** segment after `/api`
  (`/api/users/auth/login` → `/auth/login` → user-service), 60 s timeout, `ECONNREFUSED` → 503,
  `ECONNABORTED` → 504.
- **Circuit breaker** per downstream service (`proxy.js:10-69`): `CLOSED → OPEN → HALF_OPEN`,
  threshold `CIRCUIT_BREAKER_THRESHOLD` (5), open window `CIRCUIT_BREAKER_TIMEOUT` (60 000 ms).
  Exposed at `GET /api/gateway/circuit-breakers`.
- **Auth middleware** (`src/middlewares/auth.middleware.js`): verifies Bearer/cookie `accessToken` against
  `JWT_ACCESS_SECRET`, sets `req.user` and forwards `x-user-id`.
- **Rate limiting** (`src/middlewares/rateLimiting.middleware.js`): Redis **sliding window over ZSETs**
  (`ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE` pipeline), **fails open** if Redis is down. Three key spaces:
  `ratelimit:ip:{ip}` (100 / 15 min), `ratelimit:user:{userId}` (×10 leniency),
  `ratelimit:endpoint:{METHOD}:{path}:{ip}` (e.g. OTP 5/hr, login 100/15 min).

**Route table** (`src/routes/index.js`, abridged — full table in the file):

| Gateway path | Auth | Rate | Proxies to |
|---|---|---|---|
| `POST /api/users/auth/send-otp` | public | 5/hr | user `/auth/send-otp` |
| `POST /api/users/auth/verify-otp` | public | 10/hr | user `/auth/verify-otp` |
| `POST /api/users/auth/login` | public | 100/15m | user `/auth/login` |
| `POST /api/users/auth/google-auth` | public | 10/15m | user `/auth/google-auth` |
| `POST /api/users/auth/refresh` | public | 20/15m | user `/auth/refresh` |
| `GET/PUT/DELETE /api/users/user/profile` | JWT | combined | user `/user/profile` |
| `POST/GET /api/admins/stations/station` | JWT | combined | admin `/stations/station` |
| `POST /api/admins/trains/train`, `/trains/route` | JWT | combined | admin `/trains/*` |
| `GET /api/admins/trains/train/:trainId` | JWT | combined | admin `/trains/train/:id` |
| `POST /api/admins/schedules/schedule` | JWT | combined | admin `/schedules/schedule` |
| `PUT /api/admins/schedules/schedule/:scheduleId` (cancel) | JWT | combined | admin |
| `GET /api/search/trains` | public | 60/min | search `/trains` |
| `GET /api/search/autocomplete` | public | 120/min | search `/autocomplete` |
| `GET /api/inventory/schedules/:id/availability` | public | 120/min | inventory |
| `GET /api/inventory/schedules/:id/seats` | JWT | combined | inventory |
| `POST /api/bookings/bookings` | JWT | 5/min | booking `/bookings` |
| `GET /api/bookings/bookings[/:id]` | JWT | combined | booking |
| `POST /api/bookings/bookings/:id/verify-payment` | JWT | combined | booking |
| `POST /api/bookings/bookings/:id/cancel` | JWT | combined | booking |
| `POST /api/payments/webhooks/razorpay` | public (raw body) | — | payment `/webhooks/razorpay` |

Seat `lock/unlock/confirm` endpoints are deliberately **not** proxied — they are internal-only.

---

### 3.2 User Service — `:4001` (`user-service/`)

Owns identity: registration via OTP, password login, refresh-token rotation, Google OAuth, profile cache.

**Data model** (`prisma/schema.prisma`): `User` (email unique, optional bcrypt password, `emailVerified`)
and `AuthProvider` (provider + providerId, cascade delete, unique on `(provider,providerId)` and
`(userId,provider)`).

**Redis keys**

| Key | Purpose | TTL |
|---|---|---|
| `otp:session:{uuid}` | hashed OTP + pending signup meta | 300 s |
| `otp:rate:{email}` | OTP send counter (cap 5/hour) | 3600 s |
| `otp:attempts:{email}` | verify attempts (cap 5) | 300 s |
| `refresh:{userId}:{deviceId}` | refresh-token `jti` (rotation + reuse detection) | 604 800 s |
| `user:{userId}` | cached profile JSON | 86 400 s |

**Endpoints**

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/send-otp` | public |
| POST | `/auth/verify-otp` | public (reads `otp_session` cookie) |
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | public (`refreshToken` cookie) |
| POST | `/auth/google-auth` | public |
| GET/PUT/DELETE | `/user/profile` | gateway context (`x-user-id`) |
| GET | `/user/internal/:userId` | `x-internal-service-key` |

**Key logic**

- **OTP** (`src/utils/otp.js`): 6-digit `randomInt`, **HMAC-SHA256** over `email:otp` with `OTP_HMAC_SECRET`,
  verified with `crypto.timingSafeEqual` (constant-time, no plaintext in Redis).
- **Signup** (`auth.service.js`): `sendOTP` rejects existing email, bcrypt cost 12, publishes
  `notification.otp-email`; `verifyOTP` creates the user with `emailVerified: true` and publishes
  `notification.welcome-email`.
- **Refresh rotation + reuse detection** (`auth.service.js:78-94`): stored `jti` must match; a mismatch
  deletes the Redis key and forces re-login — a stolen refresh token is usable exactly once.
- **Google OAuth** (`auth.service.js:96-171`): `OAuth2Client.verifyIdToken`, links `AuthProvider` to an
  existing email inside a `prisma.$transaction`.
- **Device fingerprint** (`src/utils/deviceFingerprint.js`): `sha256(userAgent|ip|Accept).slice(0,16)` →
  used as `deviceId`, enabling per-device refresh-token families.
- **Cookies**: `httpOnly`, `secure` in prod, `sameSite: strict` in prod / `lax` otherwise.
- **Kafka**: producer only — `notification.otp-email`, `notification.welcome-email`.

---

### 3.3 Search Service — `:4002` (`search-service/`)

The CQRS **read model**: Elasticsearch only, zero PostgreSQL, all data arrives via Kafka.

**Indices** (`src/config/elasticsearch.js`): `stations` and `trains`.

- `stations`: custom `autocomplete_analyzer` with **edge_ngram** tokenizer (`min_gram 2`, `max_gram 20`),
  plus a `suggest` **completion** field fed by `[name, code, city]`.
- `trains`: `trainNumber` keyword, **nested `route`** (stationId, sequenceNumber, arrival/departure,
  distanceFromOrigin) and **nested `schedules`** (scheduleId, departureDate, status,
  available/locked/booked), plus `seatSummary` counts per seat type.

**Endpoints** (all public): `GET /trains?from=&to=&date=`, `GET /autocomplete?q=`, plus
`/debug/stations`, `/debug/trains`.

**Query pipeline** (`src/services/search.service.js:208-358`)

1. `resolveStation` — **3-tier fallback**: exact `code` term → completion suggester with
   `fuzziness: AUTO` → `multi_match` on `name,city` with `fuzziness: AUTO, prefix_length: 1`.
2. `searchTrains` — `bool.must` with **two nested `route` term clauses** + `inner_hits`
   (`from_station`, `to_station`), then a post-filter requiring
   `from.sequenceNumber < to.sequenceNumber` (segment-aware: the frontend receives `sequenceNumber`
   for both endpoints so booking can be partial-journey).
3. Matches an ACTIVE schedule on the requested date.

**Kafka consumer** (group `search-service-group-v2`, `fromBeginning: true`, wrapped in `withDLQ`):

| Topic | Handler |
|---|---|
| `admin.station-created` | `indexStation` |
| `admin.route-created` | `indexTrainRoute` (also re-indexes each route station) |
| `admin.schedule-created` | `indexSchedule` — painless script that **idempotently replaces** the schedule inside `schedules[]` |
| `admin.schedule-cancelled` | `cancelSchedule` — painless loop sets `status='CANCELLED'` |
| `inventory.seat-availability-updated` | `updateSeatAvailability` |

> `admin.train-created` is **not** consumed here — train documents are created via `admin.route-created`.

---

### 3.4 Admin Service — `:4003` (`admin-service/`)

Catalog management: stations, trains (with seats), routes, schedules. Producer-only on Kafka.

**Data model**: `Station` (unique name + code), `Train` (unique trainNumber, `Seat[]` with unique
`(trainId, seatNumber)`, 1:1 `Route`), `RouteStation` (unique `(routeId, sequenceNumber)`, unique
`(routeId, stationId)`), `Schedule` (unique `(trainId, departureDate)`, status ACTIVE/CANCELLED).

**Endpoints** (auth asserted via gateway `x-user-id`; see [gaps](#10-known-gaps--technical-debt) re: role checks):

| Method | Path |
|---|---|
| GET/POST | `/stations/station` |
| GET | `/stations/station/:stationId` |
| GET | `/stations/station/internal/:stationId` (internal, service key) |
| GET/POST | `/trains/train`, GET `/trains/train/:trainId` |
| POST | `/trains/route` |
| GET/POST | `/schedules/schedule` |
| PUT | `/schedules/schedule/:scheduleId` (cancel) |

**Validation highlights**: route sequence numbers must be **continuous starting at 1**
(`train.service.js:73-78`); one route per train; schedule requires an existing route and seat set;
duplicate trainNumber/seatNumber/code rejected with `ConflictError`.

**Kafka producer** (`src/kafka/producer/admin.producer.js`) — envelope
`{eventType, data, timestamp}` with key `{entity}-{id}`:

| Topic | Payload highlights |
|---|---|
| `admin.station-created` | station |
| `admin.train-created` | train incl. seats |
| `admin.route-created` | route + `train: trainWithSeats` |
| `admin.schedule-created` | `{scheduleId, trainId, trainNumber, coachName, totalSeats, departureDate, status, seats[], route[]}` — consumed by **inventory + search** |
| `admin.schedule-cancelled` | schedule — consumed by **inventory + search + booking** |

---

### 3.5 Notification Service — `:4004` (`notification-service/`)

**No Express app, no routes** — a pure Kafka worker validating `SENDGRID_API_KEY`, `MAIL_SEND`,
`KAFKA_BROKER` at boot and running one consumer.

- Group `notification-service-group`, `fromBeginning: false`, wrapped in `withDLQ`.
- Subscribes to **every** topic in `KAFKA_TOPICS` and dispatches only:
  `notification.otp-email`, `notification.welcome-email`, `booking.confirmed`, `booking.failed`,
  `booking.cancelled` — everything else is logged and dropped (see [gaps](#10-known-gaps--technical-debt)).
- Booking emails **skip gracefully** when the event has no `email` (enrichment is best-effort upstream).
- **Email** (`src/services/email.service.js`): SendGrid, `sendWithRetry` = 3 attempts, exponential
  backoff `2^retries * 1000` ms.
- **Templates** (`src/templates/index.js`): OTP, welcome (CTA to `FRONTEND_URL/login`), booking confirmed
  (seats + passengers + amount), booking failed (friendly reason map for `payment_failed`,
  `confirm_seats_failed`, `booking_timeout`), booking cancelled (refund line).

---

### 3.6 Booking Service — `:4005` (`booking-service/`) — *the heart of the system*

Orchestrates the booking lifecycle with a **saga**, Redis seat locks, CAS state transitions, an expiry
job, and idempotency. The most complex service.

**Data model** (`prisma/schema.prisma`)

- Enums: `BookingStatus` = `PENDING, SEATS_HELD, PAYMENT_PENDING, CONFIRMING, CONFIRMED, CANCELLING,
  FAILED, CANCELLED, EXPIRED`; `SagaStep` = `HOLD_SEATS, CREATE_PAYMENT, CONFIRM_SEATS, COMPLETE`;
  `SagaStepStatus` = `PENDING, COMPLETED, COMPENSATING, COMPENSATED, FAILED`.
- `Booking`: segment fields `fromStationId/toStationId/fromSeq/toSeq`, **`idempotencyKey @unique`**,
  **`paymentOrderId @unique`**, `lockExpiresAt`, `failureReason`, **`version` (optimistic lock)**,
  indexes on `userId`, `scheduleId`, `status`, `[lockExpiresAt, status]`.
- `BookingSeat` (unique `(bookingId, seatId)`), `Passenger`, `SagaLog` (per-step audit trail with
  request/response JSON), `IdempotencyRecord` (`eventKey @unique`).

**Endpoints** (all require gateway `x-user-id`): `POST /bookings`, `GET /bookings`,
`GET /bookings/:bookingId`, `POST /bookings/:bookingId/verify-payment`,
`POST /bookings/:bookingId/cancel`, plus a `/health` that probes **Postgres + Redis** and returns 503
when degraded.

**Saga** (`src/services/saga.service.js`)

```
forward:     HOLD_SEATS ──► CREATE_PAYMENT ──► CONFIRM_SEATS ──► COMPLETE
compensate:  ◄── release seats    ◄── refund     ◄── cancel booking   (reverse order)
```

| Step | Call | On success |
|---|---|---|
| `HOLD_SEATS` | `inventoryClient.holdSeats(scheduleId, seatIds, userId, ttl, fromSeq, toSeq)` | booking → `SEATS_HELD` |
| `CREATE_PAYMENT` | `paymentClient.createPaymentOrder`, idempotency key `{bookingId}-payment` | booking → `PAYMENT_PENDING` + `paymentOrderId` |
| `CONFIRM_SEATS` | `inventoryClient.confirmSeats` | caller CAS → `CONFIRMED` |
| compensation | `releaseSeats` / `initiateRefund` (key `{bookingId}-refund-compensation`) / `cancelBooking` | saga rows → `COMPENSATED` |

Every step writes a `SagaLog` row (`PENDING → COMPLETED/FAILED/COMPENSATED`) — the log doubles as the
**audit trail and crash-recovery record**. `compensateAll` replays COMPLETED steps in reverse
chronological order (`saga.service.js:210-229`).

**State transitions use CAS (optimistic locking)** — `casUpdateBooking` runs
`updateMany({ where: { id, version }, data: { ..., version: { increment: 1 } } })`; `count === 0` throws
`StaleStateError`. Used in five race-prone transitions: payment success (`PAYMENT_PENDING → CONFIRMING`),
payment failure (`→ FAILED`), user cancel (`→ CANCELLING`), schedule cancel (`→ CANCELLED`), and expiry
(`→ EXPIRED`).

**Redis distributed locks** (`src/utils/distributedLock.js`)

- Keys `booking:lock:seat:{scheduleId}:{seatId}` (+ `:{fromSeq}:{toSeq}` suffix for segment bookings),
  sorted alphabetically to avoid deadlock.
- **Lua `ACQUIRE_SCRIPT`**: all-or-nothing `SET NX EX` across every key — if any seat is taken, already
  acquired keys are rolled back. **Lua `RELEASE_SCRIPT`**: `DEL` only if the value matches the owner.
- **Fails closed**: a Redis error rejects the booking rather than bypassing the lock.
- TTL `BOOKING_TTL_SECONDS` (default 600 s in `.env.example`, 300 s in v2).

**Expiry job** (`src/utils/bookingExpiry.js`)

- Runs every 30 s; **leader election** via Redis `SET booking:expiry-job:leader {pid} NX EX 25` —
  the TTL (25 s) is deliberately shorter than the interval (30 s) so a dead leader can't block the next cycle.
- Finds `status IN (PENDING, SEATS_HELD, PAYMENT_PENDING) AND lockExpiresAt < now` → CAS → `EXPIRED`
  (`failureReason: 'booking_timeout'`) → `compensateAll` → force-release locks → publish `booking.failed`.

**Kafka**

- Consumes (group `booking-service-group`, `fromBeginning: false`, `withDLQ`):
  `payment.success` → `handlePaymentSuccess`, `payment.failed` → `handlePaymentFailure`,
  `admin.schedule-cancelled` → `handleScheduleCancelled`.
- Produces (3 attempts, `500*attempt` ms backoff): `booking.confirmed`, `booking.cancelled`,
  `booking.failed` with key `booking-{id}`.

**Inter-service clients** (`src/services/*Client.js`): axios + `withRetry`
(3 attempts, `200 * 2^(attempt-1)` ms, never retries 4xx), all sending `x-internal-service-key`;
`stationClient` additionally keeps a 10-minute in-memory cache.

---

### 3.7 Payment Service — `:4006` (`payment-service/`)

Owns money movement behind an **Adapter** abstraction.

**Data model**: `PaymentOrder` (status `CREATED → CAPTURED → REFUND_INITIATED → REFUNDED /
PARTIALLY_REFUNDED / FAILED`, `idempotencyKey @unique`, `gatewayOrderId @unique`,
`gatewayPaymentId @unique`, `version`), `Refund`, `PaymentAuditLog` (every action + gateway response),
`IdempotencyRecord`.

**Gateway abstraction** (`src/services/gateways/`)

- `base.gateway.js` — abstract contract: `createOrder`, `verifyPaymentSignature`,
  `verifyWebhookSignature`, `fetchPayment`, `initiateRefund`, `fetchRefund`.
- `gateway.factory.js` — singleton `getGateway()` switching on `PAYMENT_GATEWAY`; only `razorpay`
  implemented, Stripe is a documented extension point (**Adapter pattern: swap providers without touching
  `payment.service.js`**).
- `razorpay.gateway.js` — rupees → paise conversion (`Math.round(amount*100)`), HMAC-SHA256
  `orderId|paymentId` signature check with `timingSafeEqual`, webhook HMAC over the **raw body**, refunds
  via `payments.refund`.

**Endpoints**

| Method | Path | Auth |
|---|---|---|
| POST | `/orders` | `x-internal-service-key` |
| GET | `/orders/:paymentOrderId` | internal |
| POST | `/orders/:paymentOrderId/verify` | internal |
| POST | `/refunds` | internal |
| POST | `/webhooks/razorpay` | public, `express.raw` body, signature-verified |

**Two verification paths** (both may fire — CAS + status guards make it safe):

1. **Webhook (primary)**: Razorpay → `POST /webhooks/razorpay` → verify signature → audit
   `WEBHOOK_PAYMENT.CAPTURED` → `CREATED → CAPTURED` → publish `payment.success`.
2. **Client-side**: frontend calls booking `POST /bookings/:id/verify-payment` →
   `verifyAndCapturePayment` → HMAC `orderId|paymentId` → capture → publish `payment.success`.
   Invalid signature → `FAILED` + publish `payment.failed`.

**Refunds**: status guard (`CAPTURED | PARTIALLY_REFUNDED`), over-refund guard (sum of non-FAILED refunds
≤ amount), idempotency key `refund:{idempotencyKey}`, gateway call → `Refund` row `INITIATED` → parent
`REFUND_INITIATED` → on `refund.processed` webhook: refund `COMPLETED`, parent `REFUNDED` or
`PARTIALLY_REFUNDED`.

**Kafka**: producer only — `payment.success`, `payment.failed`, key `payment-{paymentOrderId}`.

---

### 3.8 Inventory Service — `:4007` (`inventory-service/`) — *source of truth for seat state*

The only service that decides whether a seat can be sold — via **three independent layers** plus
segment-aware modeling.

**Data model** (`prisma/schema.prisma`)

- `ScheduleInventory` (`scheduleId` unique, `totalSeats/available/locked/booked` counters, `version`).
- `SeatInventory` (unique `(scheduleId, seatId)` and `(scheduleId, seatNumber)`, status
  `AVAILABLE|LOCKED|BOOKED|CANCELLED`, `lockedBy/lockedAt/lockExpiresAt/bookingId`, `version`,
  index `[lockExpiresAt, status]`).
- `RouteStop` (unique `(scheduleId, stationId)` and `(scheduleId, sequenceNumber)`) — segment topology.
- **`SeatSegmentLock`** (`scheduleId, seatId, fromSeq, toSeq, status, lockedBy, lockExpiresAt,
  bookingId, version`) — the segment-booking table. Overlap rule: `a.fromSeq < b.toSeq AND
  b.fromSeq < a.toSeq`.
- `IdempotencyRecord` (`eventKey @unique`) — Kafka event dedupe.

**Endpoints**

| Method | Path | Auth |
|---|---|---|
| GET | `/schedules/:scheduleId/availability` | public |
| GET | `/schedules/:scheduleId/seats?status&seatType&fromSeq&toSeq` | `x-user-id` **or** service key |
| POST | `/seats/lock` | service key |
| POST | `/seats/unlock` | service key |
| POST | `/seats/confirm` | service key |
| POST | `/seats/cancel-booking` | service key |

**The three layers against overbooking**

1. **Redis distributed lock** — taken by booking-service around the whole create-booking flow
   (all-or-nothing Lua, TTL).
2. **Postgres row locks** — `SELECT ... FOR UPDATE NOWAIT` on `seat_inventories` / `seat_segment_locks`
   inside the transaction (fails fast instead of queueing), wrapped in `retryTransaction`
   (3 attempts, retry on deadlock/serialization errors, `50 * attempt` ms backoff).
3. **Optimistic `version` column** — CAS updates on counters and seat rows.

**Segment booking** (`src/services/inventory.service.js`)

- `lockSeats` (TTL clamped to `[60, 600]` s): segment path runs the **overlap query**
  `fromSeq < :toSeq AND toSeq > :fromSeq FOR UPDATE NOWAIT` → any hit ⇒ `ConflictError('SEATS_UNAVAILABLE')`,
  otherwise inserts `SeatSegmentLock` rows; full-journey path checks `AVAILABLE` and flips to `LOCKED`.
- `confirmSeats`: `LOCKED → BOOKED` with `bookingId`; 0 rows ⇒ `ConflictError('LOCK_EXPIRED')`.
- `unlockSeats` / `cancelBooking`: delete only rows owned by `lockedBy` / `bookingId`.
- **`recomputeSegmentSeatStatuses`**: derives each seat's summary status from its segment locks
  (0 locks → `AVAILABLE`, any `LOCKED` → `LOCKED`, else `BOOKED`).
- **`recountScheduleAggregates`**: rewrites counters with
  `COUNT(*) FILTER (WHERE status = ...)` — "source of truth" recount that prevents counter drift from
  incremental `+=` arithmetic.
- After **every** mutation: publish `inventory.seat-availability-updated` → search updates Elasticsearch.

**Lock expiry job** (`src/utils/lockExpiry.js`): every 60 s, leader-elected via **Postgres advisory lock**
`pg_try_advisory_lock(800001)` (a different election primitive than booking's Redis NX — good interview
contrast), deletes expired segment locks and full-journey locks, recomputes + recounts + republishes.

**Kafka**: consumes `admin.schedule-created` / `admin.schedule-cancelled`
(group `inventory-service-group`, `fromBeginning: true`, `withDLQ`, both handlers idempotent via
`SCHEDULE_CREATED:{scheduleId}` / `SCHEDULE_CANCELLED:{scheduleId}` idempotency keys inside the same
transaction); produces `inventory.seat-availability-updated`.

---

## 4. End-to-End Data Flows

### 4.1 Registration (OTP)

```
Browser → Gateway (rate limit 5/hr) → User: POST /auth/send-otp
  → bcrypt(12) hash staged, Redis otp:session:{uuid} (300s) + otp:rate:{email}
  → Kafka notification.otp-email → Notification → SendGrid email
Browser → POST /auth/verify-otp (otp_session cookie)
  → timing-safe HMAC compare → INSERT users (emailVerified=true)
  → Kafka notification.welcome-email → Notification → welcome email
  → Set-Cookie accessToken (15m) + refreshToken (7d), jti → Redis refresh:{user}:{device}
```

### 4.2 Login & refresh

```
POST /auth/login → bcrypt compare → JWT access {id} + refresh {id,jti}
  → cookies httpOnly/secure/sameSite=strict; profile cached user:{id} (24h)
POST /auth/refresh → verify refresh JWT → compare jti vs Redis
  → match: rotate both tokens | mismatch: DELETE key + "Refresh token reused" (force re-login)
```

### 4.3 Search

```
GET /api/search/trains?from=NDLS&to=BCT&date=2026-06-01
  → Gateway (public, 60/min) → Search
  → resolveStation ×2 (code → suggester → fuzzy multi_match)
  → nested bool query + inner_hits, filter sequenceNumber(from) < sequenceNumber(to)
  → returns trains + schedules + {from,to}.{stationId,sequenceNumber}  ← segment booking input
```

### 4.4 Admin creates a schedule (event fan-out)

```
POST /api/admins/schedules/schedule (JWT)
  → Admin: validate route+seats, unique(trainId,departureDate), INSERT schedules
  → Kafka admin.schedule-created {seats[], route[]}
       ├─► Inventory: idempotent init → schedule_inventories + seat_inventories + route_stops
       │     → Kafka inventory.seat-availability-updated ──► Search (seat summary)
       └─► Search: painless upsert of schedule inside train.schedules[]
```

### 4.5 Booking (the saga) — 14 steps

```
 1. POST /api/bookings/bookings (JWT, gateway rate 5/min, idempotencyKey = crypto.randomUUID())
 2. Gateway verifies cookie JWT → x-user-id → Booking
 3. checkIdempotency('booking:'+key)  → cached response replayed if repeat
 4. inventoryClient.getAvailability() + getSeats(fromSeq,toSeq) → segment status per seat
 5. Reject: past departure, inactive schedule, count(seats) ≠ count(passengers), fromSeq ≥ toSeq
 6. Redis Lua acquire seat locks (sorted keys, all-or-nothing, TTL)
 7. INSERT bookings (PENDING, lockExpiresAt) + booking_seats + passengers  [one transaction]
 8. Saga 1 HOLD_SEATS  → REST POST inventory /seats/lock → booking SEATS_HELD
 9. Saga 2 CREATE_PAYMENT → REST POST payment /orders (idempotency {id}-payment)
                              → booking PAYMENT_PENDING + paymentOrderId
10. Response: {bookingId, paymentOrderId, gatewayOrderId, amount, keyId}
11. Frontend loads checkout.js → Razorpay modal → user pays
12. Razorpay → POST /webhooks/razorpay (raw body, HMAC verify) → payment CAPTURED
              → Kafka payment.success
13. Booking consumer: CAS PAYMENT_PENDING→CONFIRMING → Saga 3 CONFIRM_SEATS
              → CAS → CONFIRMED → force-release Redis locks
              → Kafka booking.confirmed (enriched with user email + station names)
14. Notification → SendGrid "Booking Confirmed" | (failure path → compensateAll → booking.failed)
```

**Failure at any step** → `compensateAll()` unwinds COMPLETED saga steps in reverse, booking → `FAILED`,
locks force-released, `booking.failed` published → email.

### 4.6 Payment failure

```
webhook payment.failed → Kafka payment.failed
  → Booking consumer: CAS PAYMENT_PENDING → FAILED
  → compensateHoldSeats (REST /seats/unlock) → force-release Redis locks
  → Kafka booking.failed {reason} → Notification email
```

### 4.7 User cancellation

```
POST /api/bookings/:id/cancel → ownership check → CAS → CANCELLING
  CONFIRMED:        inventory /seats/cancel-booking  +  payment /refunds (key {id}-cancel-refund)
                    (rollback to CONFIRMED if inventory call fails)
  PAYMENT_PENDING / SEATS_HELD: inventory /seats/unlock
  → CAS CANCELLING → CANCELLED → force-release locks → Kafka booking.cancelled → email + refund
```

### 4.8 Booking expiry (self-healing)

```
every 30s (single leader via Redis NX EX 25):
  SELECT PENDING|SEATS_HELD|PAYMENT_PENDING WHERE lockExpiresAt < now()
  → CAS → EXPIRED ('booking_timeout') → compensateAll → force-release locks
  → Kafka booking.failed → email
```

### 4.9 Schedule cancellation (broadcast)

```
PUT /api/admins/schedules/schedule/:id (cancel) → Kafka admin.schedule-cancelled
  ├─► Inventory: idempotent cancel → schedule + all seats CANCELLED, counters zeroed → availability event
  ├─► Search:    painless loop sets schedule status CANCELLED in ES
  └─► Booking:   bulk CAS all active bookings → CANCELLED ('schedule_cancelled'),
                 force-release locks, refund CONFIRMED ones, publish booking.cancelled ×N
```

---

## 5. Kafka Topic Catalog

All topics are centralized in **`shared/constants/kafka-topics.js`** (`DLQ_MAX_RETRIES = 3`).
**22 topics are defined: 18 domain + 4 DLQ; 13 are actively produced.**

| Topic | Producer | Consumer(s) | Purpose |
|---|---|---|---|
| `notification.otp-email` | user | notification | send OTP email |
| `notification.welcome-email` | user | notification | send welcome email |
| `notification.booking-email` | — | (defined only) | *dead topic* |
| `notification.payment-email` | — | (defined only) | *dead topic* |
| `admin.station-created` | admin | search | index station in ES |
| `admin.train-created` | admin | notification (dropped) | *no search consumer; trains indexed via route* |
| `admin.route-created` | admin | search | index train + route stations |
| `admin.schedule-created` | admin | **inventory + search** | initialize seat inventory / index schedule |
| `admin.train-updated` | — | — | *dead topic* |
| `admin.station-updated` | — | — | *dead topic* |
| `admin.route-updated` | — | — | *dead topic* |
| `admin.schedule-cancelled` | admin | **inventory + search + booking** | cancel inventory / ES status / bulk-cancel bookings |
| `inventory.seat-availability-updated` | inventory | search | keep ES seat counters fresh |
| `booking.confirmed` | booking | notification | confirmation email |
| `booking.cancelled` | booking | notification | cancellation + refund email |
| `booking.failed` | booking | notification | failure email |
| `payment.success` | payment | **booking** | advance saga → CONFIRMED |
| `payment.failed` | payment | **booking** | fail saga + compensate |
| `dlq.booking-service` | booking DLQ | — (terminal) | poison messages |
| `dlq.inventory-service` | inventory DLQ | — (terminal) | poison messages |
| `dlq.search-service` | search DLQ | — (terminal) | poison messages |
| `dlq.notification-service` | notification DLQ | — (terminal) | poison messages |

> **Canonical count for interviews: 18 domain topics + 4 DLQs = 22 defined, 13 actively used.**
> (Your PDFs variously say 15 or 19 — reconcile to this number; the constants file is ground truth.)

**Consumer groups (primary implementation)**

| Group | Service | Topics | `fromBeginning` |
|---|---|---|---|
| `booking-service-group` | booking | `payment.success`, `payment.failed`, `admin.schedule-cancelled` | false |
| `inventory-service-group` | inventory | `admin.schedule-created`, `admin.schedule-cancelled` | true |
| `search-service-group-v2` | search | `admin.station-created`, `admin.route-created`, `admin.schedule-created`, `admin.schedule-cancelled`, `inventory.seat-availability-updated` | true |
| `notification-service-group` | notification | *all 22 topics* (handles 5, drops the rest) | false |

**DLQ design** (`shared/utils/dlqHandler.js`, mirrored by `packages/shared/src/kafka/dlq-handler.ts`)

- Retry counter keyed `topic:partition:offset`, max **3** attempts.
- Handler throws → rethrow so KafkaJS redelivers; attempt ≥ 3 → forward original key/value to
  `dlq.{service}` with headers `dlq-original-topic`, `dlq-original-partition`, `dlq-original-offset`,
  `dlq-error`, `dlq-timestamp`.
- Unparseable JSON → immediate DLQ, no retry. DLQ publish failure never blocks the consumer.
- Message ordering by key (`booking-{id}`, `schedule-{id}`, `{entity}-{id}`) gives per-entity ordering
  within a partition.

**Schemas**: `schemas/kafka/` holds JSON Schema contracts for `booking-confirmed`, `payment-success`,
and `schedule-created` events (plus Confluent Schema Registry running on 8082).

---

## 6. Design Patterns → Code Map

| # | Pattern | Where it lives | One-liner |
|---|---|---|---|
| 1 | **Saga (orchestration + compensation)** | `booking-service/src/services/saga.service.js` | `HOLD_SEATS → CREATE_PAYMENT → CONFIRM_SEATS`; compensation in reverse; every step in `saga_logs` for audit + crash recovery. |
| 2 | **CAS / optimistic locking** | `booking.service.js` `casUpdateBooking`, `version` columns everywhere | `UPDATE ... WHERE id AND version = expected`; 0 rows → `StaleStateError`; resolves webhook-vs-expiry races without DB locks. |
| 3 | **Distributed lock (Lua, all-or-nothing)** | `booking-service/src/utils/distributedLock.js` | `SET NX EX` per seat key with rollback; sorted keys prevent deadlock; release only if owner matches; **fails closed**. |
| 4 | **Segment booking (interval overlap)** | `inventory.service.js` + `seat_segment_locks` | `a.fromSeq < b.toSeq AND b.fromSeq < a.toSeq`; same seat sold for non-overlapping legs — airlines-style revenue maximization. |
| 5 | **DB row locks (fail-fast)** | `inventory.service.js` `FOR UPDATE NOWAIT` + `retryTransaction` | Second layer against concurrent seat sales; deadlocks retried 3× with backoff. |
| 6 | **Idempotency (4 levels)** | `checkIdempotency`, `IdempotencyRecord`, status guards, event keys | API `booking:{key}`, payment `payment-order:{key}` / `refund:{key}`, consumer `status === 'CONFIRMED'`, inventory `SCHEDULE_CREATED:{id}`. |
| 7 | **Outbox / transactional consistency** | `saga_logs` + `idempotency_records` in same Prisma `$transaction`; v2 `OutboxModule` | Business row and its audit/idempotency rows commit atomically → no dual-write to DB+Kafka. |
| 8 | **Dead-letter queue** | `shared/utils/dlqHandler.js` | 3 in-process retries → per-service DLQ with error metadata headers. |
| 9 | **Circuit breaker** | `api-gateway/src/services/proxy.js` | CLOSED → OPEN (threshold 5) → HALF_OPEN (60 s window); fail-fast with 503; status endpoint for ops. |
| 10 | **Sliding-window rate limiting** | `api-gateway/src/middlewares/rateLimiting.middleware.js` | Redis ZSET pipeline; IP / user / endpoint keys; fail-open on Redis outage. |
| 11 | **Leader election** | `bookingExpiry.js` (Redis NX EX 25 s), `lockExpiry.js` (PG advisory lock) | Exactly one replica runs each sweeper per cycle; two different primitives in one codebase. |
| 12 | **Adapter (payment gateway)** | `payment-service/src/services/gateways/` | `BaseGateway` + factory → add Stripe without touching `payment.service.js`. |
| 13 | **CQRS / event-driven read model** | `search-service` + Kafka | Postgres is the write model; Elasticsearch and email are projections fed only by events. |
| 14 | **Idempotent consumer** | inventory/search handlers, booking status guards | Replayed Kafka messages are no-ops (`idempotency_records` + CAS count checks). |
| 15 | **Internal service auth** | `internalAuth.middleware.js` / `InternalAuthGuard` | `x-internal-service-key` (32+ chars) on all service-to-service calls, separate from user JWT. |

### Overbooking — the 30-second answer

> "Three independent layers: (1) an **all-or-nothing Redis Lua lock** across all requested seats before any
> DB write, (2) **`FOR UPDATE NOWAIT` row locks** inside the inventory transaction so conflicting writers
> fail fast instead of queuing, and (3) an **optimistic `version` CAS** on every status transition. Plus
> segment bookings add a **set-overlap predicate** on `seat_segment_locks`. A lock TTL + sweeper job
> guarantees nothing leaks if a service dies mid-flow."

---

## 7. Cross-Cutting Concerns

### Security model

| Layer | Mechanism |
|---|---|
| Browser → gateway | JWT in **httpOnly cookies** (`secure`, `sameSite: strict` in prod), 15 m access / 7 d refresh |
| Refresh rotation | `jti` bound to `refresh:{userId}:{deviceId}` in Redis; reuse ⇒ family invalidated |
| OTP | HMAC-SHA256 hash in Redis, `timingSafeEqual`, 5/hr send cap, 5 verify attempts, 300 s TTL |
| Gateway → service | verified once, forwarded as `x-user-id` |
| Service → service | `x-internal-service-key` compared to `INTERNAL_SERVICE_KEY` |
| Payments | Razorpay signature + webhook HMAC over raw body, `timingSafeEqual` |
| Transport hardening | Helmet (CSP/HSTS), CORS `ALLOWED_ORIGINS`, rate limits (OTP 5/hr, login 100/15 min) |
| Network | Docker bridge `irctc-network`; internal endpoints (`/internal/...`) separated from public ones |

### Redis key taxonomy (whole system)

| Key | Service | Purpose | TTL |
|---|---|---|---|
| `otp:session:{uuid}` / `otp:rate:{email}` / `otp:attempts:{email}` | user | OTP flow | 300 s / 3600 s / 300 s |
| `refresh:{userId}:{deviceId}` | user | refresh `jti` (rotation) | 604 800 s |
| `user:{userId}` | user | profile cache | 86 400 s |
| `ratelimit:ip:{ip}` / `ratelimit:user:{id}` / `ratelimit:endpoint:{...}` | gateway | sliding window ZSETs | window |
| `booking:lock:seat:{scheduleId}:{seatId}[:{from}:{to}]` | booking | seat mutex | `BOOKING_TTL_SECONDS` |
| `booking:expiry-job:leader` | booking | leader election | 25 s |

### Observability

- **Metrics** (`packages/shared` + per-service): `http_request_duration_seconds` (histogram, buckets
  0.01…5 s), `http_requests_total`, `kafka_messages_processed_total{service,topic,status}`,
  `gateway_circuit_breaker_state`, `booking_status_total{status}`, `payment_captured_total`, plus
  `irctc_`-prefixed default Node metrics on `/metrics`.
- **Prometheus** scrapes all 8 services every 15 s (`infra/prometheus/prometheus.yml`).
- **Alert rules** (`infra/prometheus/alerts.yml`): 5xx error rate > 5 % / 5 min (page), p95 latency > 2 s
  (warn), circuit breaker OPEN (page).
- **Grafana** (port 3001) auto-provisions a Prometheus datasource and 4 dashboards
  (service-overview, booking-saga, business, kafka) with panels: request rate, p95 latency,
  confirmed bookings, DLQ messages, payment captures.
- **Correlation IDs**: `x-correlation-id` generated/propagated by an interceptor, injected into every log
  line via `AsyncLocalStorage` — one ID traces Gateway → Booking → Inventory → Payment.
- **OpenTelemetry**: OTLP exporter to `OTEL_EXPORTER_OTLP_ENDPOINT` (4318), HTTP + Express instrumentation.
- **Kibana** reuses the Elasticsearch cluster for log search.

### Testing

| Type | Tooling | Coverage |
|---|---|---|
| Unit | Jest (`jest.config.ts` per package) | saga step order, segment overlap, HMAC signature shape, route sequence validation, OTP template render, device fingerprint, proxy segment mapping |
| Integration | Supertest | declared in devDeps; suites are minimal |
| Load | **k6** (`tests/load/`) | `search-trains.ts` (ramp 0→50→100→0 VU, p95 < 2 s, err < 1 %), `seat-locking.ts` (50 VUs hammering `/seats/lock`, accepts 200/409/404), `booking-flow.ts` (25 VUs full `POST /bookings`, p95 < 2.5 s, err < 5 %) |
| CI | `.github/workflows/ci.yml` | `pnpm install --frozen-lockfile → typecheck → lint → test → build` (Node 20, pnpm 9) |

### Configuration

Root `.env.example` carries the shared secrets and infra URLs
(`INTERNAL_SERVICE_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HMAC_SECRET`, `REDIS_URL`,
`KAFKA_BROKER=localhost:9093`, `ELASTICSEARCH_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, SendGrid, Google,
Razorpay, and the 5 per-service `*_DATABASE_URL`s). Each service also has its own `.env.example`.

Key tunables: `CIRCUIT_BREAKER_THRESHOLD=5`, `CIRCUIT_BREAKER_TIMEOUT=60000`, `SERVICE_TIMEOUT_MS=60000`,
`BOOKING_TTL_SECONDS=600`, `LOCK_TTL_SECONDS=300/600`, `BOOKING_EXPIRY_CHECK_INTERVAL_MS=30000`,
`LOCK_EXPIRY_INTERVAL_MS=60000`, `DLQ_MAX_RETRIES=3`, `RATE_LIMIT_MAX_REQUESTS=100`,
`RATE_LIMIT_WINDOW_MS=900000`, `MAX_SEATS_PER_BOOKING=6` (frontend).

---

## 8. v2: The `packages/` NestJS Workspace

`pnpm-workspace.yaml` → `packages/*` (9 packages). This is what **`docker-compose.yml` actually builds**
(each `packages/*/Dockerfile`), and what **CI runs** (`pnpm -r typecheck/lint/test/build`).

### What `@irctc/shared` gives every service for free

`bootstrapNestService(AppModule, { serviceName, swaggerTitle, rawBody })`
(`packages/shared/src/bootstrap.ts:33-79`) installs:

- Global prefix **`api/v1`** (excluding `/health`, `/metrics`), cookie-parser, Helmet, CORS from
  `ALLOWED_ORIGINS`.
- Global **validation pipe** (`transform`, `whitelist`, `forbidNonWhitelisted`),
  **`HttpExceptionFilter`** (uniform `{success:false, error:{code,message}}` + `correlationId`).
- Interceptor chain: **CorrelationId → Logging (pino) → Metrics (prom-client)**.
- Swagger at `/api/docs` (Bearer + `x-internal-service-key` schemes), shutdown hooks.

Plus on-demand modules: `KafkaModule` (producer/consumer/`withDLQ`), `RedisModule`,
`OutboxModule.forFeature(table)`, `OpenTelemetryModule`, `MetricsController` (`GET /metrics`),
`JwtAuthGuard` / `InternalAuthGuard`, `CircuitBreakerService` (Redis-backed),
`RateLimiterService`, `DistributedLockService` (same Lua scripts), `IdempotencyService`,
`InternalHttpClientService` (axios + circuit breaker + service key), Zod `service-config` validation,
error-code enum, and typed event interfaces in `types/`.

### Per-package deltas

| Package | Notable vs primary |
|---|---|
| `api-gateway` | `AuthMiddleware` + `RateLimitMiddleware` on `*`, catch-all `@All('*')` proxy; route table keyed by first segment (`users|search|admin|notification|bookings|payments|inventory`); **whitelists `search`/`admin`/`inventory` as public** |
| `user-service` | Global `APP_GUARD JwtAuthGuard` with `@Public()` auth controller; **transactional outbox** for `notification.*` events; OTP flow identical (HMAC + timing-safe) |
| `admin-service` | Drizzle schema, outbox producer, no guards at service level |
| `search-service` | Indices renamed `irctc-stations` / `irctc-trains`; consumer group `search-service` |
| `inventory-service` | Own Redis mutex namespace `lock:inventory:{scheduleId}:{seatId}:...` (separate from booking's keys); `@Interval(60000)` lock sweeper; segment logic identical |
| `booking-service` | Saga/`clients.ts`/CAS/expiry identical in shape; producer is **outbox-only**; `@Interval(30000)` expiry |
| `payment-service` | `bootstrapNestService(..., { rawBody: true })` so webhook HMAC sees raw bytes; `@Public()` webhook; Razorpay signature via `timingSafeEqual` |
| `notification-service` | Consumes only the 5 handled topics (cleaner than primary's subscribe-all) |

**Outbox is the only produce path in v2**: `OutboxService.publish` inserts a `PENDING` row in the same
transaction as business data; an `@Interval(5000)` poller ships up to 100 rows, marking `SENT` or
`FAILED` after `maxRetries: 5`. The direct `KafkaProducerService` is reserved for DLQ publishing.

**Tests** (9 specs, all smoke-level): shared segment overlap, gateway proxy mapping, user fingerprint,
admin sequence continuity, inventory segment lock, booking saga order, payment HMAC shape, search date
normalization, notification OTP template.

---

## 9. Talking Points & Metrics to Quote

### Numbers (verified against code)

| Metric | Value |
|---|---|
| Microservices | **8** + 1 shared package + 1 frontend |
| Ports | gateway 4000 → inventory 4007 (contiguous block) |
| Kafka topics defined | **22** (18 domain + 4 DLQ); **13 actively produced** |
| Saga steps | **3 forward + 3 compensating**, all logged to `saga_logs` |
| Overbooking defenses | **3 layers** (Redis Lua, `FOR UPDATE NOWAIT`, CAS version) |
| Auth paths | **3** (OTP + password, Google OAuth, JWT refresh rotation) |
| Rate-limit strategies | **3** (IP, user, endpoint-specific) — sliding window, fail-open |
| Search resolution tiers | **3** (exact code → completion suggester → fuzzy multi_match) |
| DLQ retries | **3** per message, then dead-letter with metadata headers |
| Circuit breaker | threshold **5**, open window **60 s** |
| Booking expiry sweep | every **30 s**, leader TTL **25 s** |
| Inventory lock sweep | every **60 s**, PG advisory lock |
| Max seats per booking | **6** (frontend cap) |
| Postgres databases | **5** (user, admin, inventory, booking, payment) |
| k6 scenarios | 3 (search ramp to 100 VU, 50 VU seat-lock contention, 25 VU booking flow) |

### The 5 things to explain in 60 seconds

1. **The saga** — `createBooking → HOLD_SEATS (inventory REST) → CREATE_PAYMENT (Razorpay order) →
   client pays → webhook → `payment.success` → `CONFIRM_SEATS` → `booking.confirmed` → email.
   Any failure runs `compensateAll()` in reverse using the `saga_logs` trail.
2. **The lock stack** — Redis Lua `SET NX EX` all-or-nothing → `FOR UPDATE NOWAIT` → CAS `version`.
   Segment keys carry `fromSeq:toSeq`, so the same seat can be sold to two non-overlapping passengers.
3. **The event bus** — `admin.schedule-created` → inventory seeds seats + search indexes the schedule;
   `payment.success` → booking confirms → `booking.confirmed` → notification emails; every inventory
   mutation emits `seat-availability-updated` so ES never lags.
4. **Segment booking** — `seat_segment_locks` + overlap predicate `a.fromSeq < b.toSeq AND
   b.fromSeq < a.toSeq`; `recomputeSegmentSeatStatuses()` + `recountScheduleAggregates()` keep counters
   truthful (no drift from incremental arithmetic).
5. **The gateway** — one entrypoint: JWT once, sliding-window rate limits, path-strip proxy, per-service
   circuit breaker with a live status endpoint.

### Likely follow-ups

| Question | Answer hook |
|---|---|
| Why saga over 2PC? | 2PC holds DB resources and has a coordinator SPOF; saga is async, resilient, and `saga_logs` gives auditability + recovery. |
| Two users book the same seat — walk through it. | Booking A takes the Redis lock; B's Lua script fails atomically (no partial lock). If both somehow pass, `FOR UPDATE NOWAIT` makes one transaction fail fast; if both commit attempts race on status, CAS drops the loser. |
| Webhook vs expiry job race? | Both try `PAYMENT_PENDING → .../EXPIRED` via CAS; exactly one gets `count > 0`, the other gets `StaleStateError` and no-ops. System self-heals. |
| What if Kafka dies? | Booking/payment still work synchronously over REST; notifications and ES indexing lag; consumers resume from committed offsets on recovery; poison messages land in DLQs after 3 tries. |
| Where's the outbox? | v1: `saga_logs` + `idempotency_records` commit in the same Prisma transaction as business rows (no DB↔Kafka dual write in the request path). v2: real polled outbox table, 5 s interval, 5 retries. |
| Duplicate booking prevention? | Client `idempotencyKey` → `idempotency_records` cache; payment orders keyed `{bookingId}-payment`; consumers guarded by status checks. |
| Why Elasticsearch, not Postgres FTS? | Fuzzy + completion suggester + edge_ngram prefixes + nested route queries; and it keeps read load off the write DB (CQRS). |
| Why Redis over in-memory cache? | Shared across replicas; one technology powers cache, rate-limit ZSETs, locks, and leader election. |
| Add Stripe? | New `stripe.gateway.js extends BaseGateway`, add a factory case, flip `PAYMENT_GATEWAY=stripe`. `payment.service.js` untouched (Adapter). |
| Segment vs full journey? | `getSeats` marks overlapping segments `segmentStatus: 'UNAVAILABLE'`; legacy full-journey bookings still write `seat_inventories.status` directly — non-breaking. |
| How do you know it's healthy? | `/metrics` per service, Prometheus 15 s scrape, Grafana dashboards, 3 alert rules, correlation IDs across hops, OTLP traces, `/health` returning 503 on DB failure. |

---

## 10. Known Gaps & Technical Debt

Candor here is a plus in interviews — these are all real, found by reading the code:

**Functional**
1. `user-service` `PUT/DELETE /user/profile` controllers are **TODO stubs** though the gateway exposes them.
2. `admin.train-updated` / `station-updated` / `route-updated` and `notification.booking-email` /
   `payment-email` topics are **defined but never produced**.
3. `admin.train-created` has **no search consumer** — trains only get indexed via `admin.route-created`.
4. `notification-service` subscribes to **all 22 topics** and drops everything it doesn't handle (including
   its own DLQ topic). No HTTP/health endpoint either, despite a published port 4004.
5. No **role-based authorization** anywhere: gateway admin routes use `requireAuth` only, and the frontend
   `ProtectedRoute` has no role check — any logged-in user can open `/admin`.

**Correctness / bugs**
6. `user-service/src/controllers/auth.controller.js:5` requires `../utils/deviceFingerPrint` but the file
   is `deviceFingerprint.js` — **case mismatch fails on a case-sensitive filesystem**.
7. `booking-service/src/services/stationClient.js:64` calls `/station/internal/:id` but admin mounts
   `/stations/station/internal/:id` → enrichment 404s (swallowed by a warning log).
8. v2 `saga.service.ts:61` `markCompensated` ignores its `step` argument and marks **every** saga row for
   the booking as `COMPENSATED`.
9. DLQ retry counts are **in-process only** — restart resets the counter.
10. `.env.example` drift: gateway example maps booking→4003/payment→4005 (contradicting config defaults),
    user example sets `KAFKA_BROKER=localhost:9094` and omits required `GOOGLE_CLIENT_ID`/`MAIL_SEND`,
    root defines `MAIL_FROM` while services read `MAIL_SEND`.

**Ops / infra**
11. **`pnpm-lock.yaml` is missing** → CI's `pnpm install --frozen-lockfile` fails as written.
12. `infra/prometheus/alerts.yml` is **not referenced** by `prometheus.yml` (`rule_files` absent) — the
    three alert rules never load.
13. All four Grafana dashboards are **byte-identical except the title** (same 5 panels), despite names
    implying saga/business/kafka-specific views.
14. k6 load tests aren't wired into CI; frontend has no lint/test scripts (root ESLint ignores all `.js`).
15. Single Postgres instance, no replicas; inter-service auth is a shared secret (→ mTLS/service mesh in
    production); polling outbox (→ Debezium CDC).

**Interview-ready framing:** *"I'd prioritized: (1) lockfile + alert wiring so CI and alerting actually run,
(2) RBAC on admin routes, (3) persisting DLQ counters, (4) fixing the station-client path and case-sensitive
import, (5) then Debezium-based outbox and mTLS."*

---

### Key file cheat sheet

| Area | Files |
|---|---|
| Gateway | `api-gateway/src/services/proxy.js`, `src/routes/index.js`, `src/middlewares/rateLimiting.middleware.js`, `src/middlewares/auth.middleware.js` |
| Auth | `user-service/src/services/auth.service.js`, `src/utils/otp.js`, `src/utils/auth.js`, `src/utils/deviceFingerprint.js` |
| Saga / booking | `booking-service/src/services/saga.service.js`, `booking.service.js`, `src/utils/distributedLock.js`, `src/utils/bookingExpiry.js` |
| Inventory | `inventory-service/src/services/inventory.service.js`, `src/utils/retryTransaction.js`, `src/utils/lockExpiry.js` |
| Payment | `payment-service/src/services/payment.service.js`, `src/services/gateways/{base.gateway,gateway.factory,razorpay.gateway}.js` |
| Search | `search-service/src/services/search.service.js`, `src/config/elasticsearch.js`, `src/kafka/consumer/search.consumer.js` |
| Events | `shared/constants/kafka-topics.js`, `shared/utils/dlqHandler.js`, `schemas/kafka/*.json` |
| v2 shared | `packages/shared/src/bootstrap.ts`, `src/kafka/*`, `src/outbox/outbox.service.ts`, `src/metrics/*` |
| Infra | `docker-compose.yml`, `infra/postgres/init.sql`, `infra/prometheus/*`, `infra/grafana/*` |
| Tests | `tests/load/*.ts`, `packages/*/test/*.spec.ts`, `.github/workflows/ci.yml` |
