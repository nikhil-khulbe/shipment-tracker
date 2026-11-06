# Shipment Tracker

A courier-tracking app (think Delhivery / Blue Dart): anyone can look up a parcel by tracking ID and see its timeline; admins log in to create shipments and advance their status (login can be switched off with `REQUIRE_ADMIN=false` for an open demo). Built as a full-stack TypeScript monorepo — **GraphQL API + React Native (Expo) app** that runs on Android, iOS and web.

> **Live demo:** _TODO — add Netlify URL after deploy_ · **Android APK:** _TODO — add GitHub Release link_
> The API runs on a free Render instance and sleeps when idle — the first request can take 30–50 s to wake it.

| Track | Admin |
|---|---|
| ![Track](docs/screenshots/track.jpg) | ![Admin](docs/screenshots/admin-login.jpg) |

_Demo GIF: TODO._

## Stack

| Layer | Tech |
|---|---|
| API | Node, Express 5, Apollo Server 5, GraphQL, Mongoose 8, MongoDB |
| Auth | JWT (HS256, 8h) + bcrypt |
| App | Expo (React Native), TypeScript, Apollo Client 4, React Navigation (bottom tabs), Reanimated |
| Tests | Jest, ts-jest, mongodb-memory-server |
| Deploy | MongoDB Atlas, Render (API), Netlify (web), EAS (APK) |

## Features

- **Public:** `shipment(trackingId)` query → current status + full timeline.
- **Admin (JWT login by default):** `createShipment`, `updateStatus`, and `shipments(status, search, cursor, limit)` — a cursor-paginated list. Set `REQUIRE_ADMIN=false` on the API to make them open for demos; the public `authRequired` query tells the app whether to show the login form.
- **Shipment details (all optional):** sender name, receiver phone, package type, weight, description and an **estimated delivery date**. The Track screen shows "Arriving tomorrow" / "Arriving by Sat, 9 Nov" (red when running late) and "Delivered on ..." once done. Shipments created before these fields existed still work. The receiver's phone is masked (last 4 digits) for everyone except a logged-in admin, because a tracking ID is not a secret.
- **Abuse protection:** per-IP rate limit on `/graphql` (300 / 15 min) and a much tighter one on `login` (10 / 15 min), plus a query depth limit.
- **Status state machine:** a main path `CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`, one step at a time, plus exceptions: `DELAYED`, `ON_HOLD`, `DELIVERY_ATTEMPT_FAILED`, `RETURNED`, `CANCELLED`. Each exception needs a written reason (shown on the Track screen). `DELAYED`/`ON_HOLD` resume where the parcel left off, a failed attempt can be retried, `DELIVERED`/`RETURNED`/`CANCELLED` are final. Illegal moves are rejected with `INVALID_STATUS_TRANSITION`. The API exposes `allowedNextStatuses` on each shipment, so the app never duplicates the rules.
- Status history is append-only.

**App**
- Animated timeline (staggered slide-in), progress bar, skeleton loaders, icon status badges, Inter font.
- Light / dark mode that follows the device (one theme object, no colours in components).
- Haptics and toasts on track / create / update.
- **Deep links:** `/track/SHP-XXXXXXXX` on web, `shipmenttracker://track/SHP-XXXXXXXX` on native; a "Share link" button.
- Auto-refresh every 30 s ("Updated just now"), paused while the app is backgrounded; pull-to-refresh.
- **Optimistic status updates** that roll back automatically if the server rejects them.
- Admin list: search by tracking-ID prefix, status filter chips, infinite scroll; tap a row to update it.
- **Offline:** last result is cached on-device and shown without a connection, recent searches appear as chips, and an offline banner slides in.

## Repo layout

```
apps/
  api/      Express + Apollo server
    src/domain/     pure logic (status state machine) — no Mongo, no GraphQL
    src/services/   business rules (shipmentService, authService)
    src/resolvers/  thin GraphQL adapters
    src/models/     Mongoose schemas
    src/__tests__/  resolver tests via ApolloServer.executeOperation
  mobile/   Expo app (Track + Admin tabs)
```

Request path: Express → Apollo → `context` verifies the JWT → resolver calls `requireAdmin` → service applies rules → Mongoose → typed result.

## Local setup

Requires Node 20+ and a MongoDB (local `mongod` or an Atlas URI).

```bash
npm install                      # from the repo root (npm workspaces)

# API
cp apps/api/.env.example apps/api/.env      # then edit values
npm run seed -w api              # creates/updates the admin from SEED_ADMIN_*
npm run dev -w api               # http://localhost:4000/graphql

# App
cp apps/mobile/.env.example apps/mobile/.env
cd apps/mobile && npx expo start # press w for web, or scan the QR with Expo Go
```

On a physical phone, `localhost` is the phone itself — set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (e.g. `http://192.168.1.23:4000/graphql`). Android emulator uses `10.0.2.2`.

### Environment variables

**API (`apps/api/.env`)**

| Var | Purpose |
|---|---|
| `NODE_ENV` | `production` disables introspection and masks internal errors |
| `PORT` | listen port (Render sets this) |
| `MONGODB_URI` | Mongo connection string (required) |
| `JWT_SECRET` | 32+ random bytes (required) — `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | token lifetime, default `8h` |
| `REQUIRE_ADMIN` | default `true`. `false` = open demo mode, no login needed for admin operations |
| `RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_MAX` | per-IP requests per 15 min on `/graphql` (default 300) and login attempts (default 10) |
| `CORS_ORIGIN` | comma-separated allowed browser origins (needed for the web build) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | only read by `npm run seed` |

**App (`apps/mobile/.env`)**

| Var | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | GraphQL endpoint. Inlined into the bundle at build time — public, never put secrets here |
| `EXPO_PUBLIC_WEB_URL` | optional — the deployed web URL, used to build the "Share link" URL |

## Tests

```bash
npm test -w api
```

Twenty-two tests run through `ApolloServer.executeOperation` against an in-memory MongoDB, so schema, context and error formatting are all exercised:

1. Public `shipment` query returns full history, and `null` for an unknown ID.
2. `createShipment` creates a correct initial state.
3. `updateStatus` advances legally and appends to history.
4. `updateStatus` rejects an illegal transition **and leaves the document unchanged**.
5. `login` succeeds, and fails with an identical error for wrong password vs. unknown email.
6. In open mode the admin list needs no login.
7. The admin list pages through every shipment exactly once (including rows that share a `createdAt`), newest first, and honours the status filter, tracking-ID search and rejects a bad cursor.
8. `canTransition` over the full 5×5 matrix (pure unit test).
9. Locked mode (`REQUIRE_ADMIN=true`): `authRequired` is reported, list/create/update reject anonymous callers without changing data, public tracking stays open, a logged-in admin still works.
10. The query depth limit.
11. Shipment details: stored, phone masked for anonymous viewers, invalid ETD/phone/weight rejected, old shipments still load.
12. Exception rules (pure): terminal states have no exit, nothing moves to itself, resume targets, where cancel/return/failed-attempt are reachable.
13. Exceptions through the API: a reason is required, delay then resume then deliver, failed attempt then retry then return, cancel before pickup.

The first run downloads a MongoDB binary, so it can be slow on a cold machine.

## Design decisions

- **Thin resolvers, service layer, pure domain.** `canTransition` has no framework dependencies, which is why it's trivially testable and reusable.
- **`currentStatus` is denormalised** from `history` for cheap indexed reads. The cost is duplicated state, so `updateStatus` is the *only* writer of both.
- **`updateStatus` is an atomic compare-and-swap:** one `findOneAndUpdate` whose filter includes the expected `currentStatus`. Two simultaneous updates can't both append; the loser gets an invalid-transition error.
- **`shipment` returns `null` on a miss; `updateStatus` throws.** A missed public lookup is a normal outcome; an admin acting on a nonexistent shipment is a bug.
- **Unique index + catch E11000** for tracking IDs (retry up to 3×) instead of find-then-insert, which has a race.
- **`login` returns the same error for unknown email and wrong password**, so it can't be used to enumerate accounts.
- **No role claim in the JWT.** Admin-ness is a DB fact checked per request, so revoking access is deleting the admin row, not waiting for expiry.
- **No refresh token.** 8h ≈ a work shift; rotation is the right answer for a real product and more code than this scope earns.
- **Timestamps are ISO `String`s, not a `DateTime` scalar** — no date is ever an input here, so a scalar buys nothing.
- **Production hardening:** introspection off, internal errors masked (real error logged server-side), 100kb body limit, `/healthz`.
- **Token storage:** `expo-secure-store` (Keychain/Keystore) on native. SecureStore has no web implementation, so the web build falls back to `localStorage`, which is XSS-exposed.
- **Cursor pagination, not skip/limit.** The cursor is an opaque `(createdAt, _id)` pair; `skip` is O(n) and shifts rows when new shipments arrive mid-scroll. The query fetches `limit + 1` rows to learn whether another page exists, and the `_id` tie-break keeps the order stable when two rows share a timestamp (covered by a test). Search is an *anchored* prefix match so it can use the `trackingId` index.
- **Polling, not subscriptions, for live status.** Status changes are minutes apart and polling needs no WebSocket infrastructure on a free API tier.
- **Optimistic UI.** `updateStatus` writes a predicted result into Apollo's optimistic cache layer; if the server rejects it, that layer is discarded and the UI snaps back with no hand-written undo.
- **Cache persistence excludes admin data.** The on-device cache is a custom ~60-line save/restore (the off-the-shelf `apollo3-cache-persist` targets Apollo 3 and can't filter). Before saving, the admin list and profile are evicted and the cache garbage-collected, so only what the public Track screen showed is written to disk. It's also wiped on logout.
- **One theme object.** Light and dark palettes share the same keys; components call `useTheme()` and never contain a hex literal.
- **Mongoose pinned to 8.x.** Mongoose 9's bundled driver failed its handshake against the `mongodb-memory-server` binary; 8.x works.
- **Deliberately not used:** Redux/Zustand (Apollo cache + local state is enough), a UI kit, form libraries, `type-graphql`, DataLoader (`history` is embedded, so no N+1).

## Known limitations / what I'd do next

- Single seeded admin; no signup, password reset or roles.
- Atlas free tier with a `0.0.0.0/0` allowlist (Render's free tier has no static IP) — the real fix is private networking on a paid tier.
- JWT in `localStorage` on web; an httpOnly cookie would be better there but doesn't suit a shared native client.
- Polling interval is fixed; the API would need subscriptions for true push.
- The offline banner and haptics are only verified on web/emulated paths so far; check on a physical device.
- Next: GraphQL subscriptions for live status, graphql-codegen for shared types, structured logging.
- CI (`.github/workflows/ci.yml`) typechecks both apps and runs the API tests on every push.

## Deployment (summary)

1. **Atlas:** M0 cluster (Mumbai), user scoped to `shipment_tracker`, network access `0.0.0.0/0`. Run the seed against it.
2. **Render:** root dir `apps/api`, build `npm install && npm run build`, start `node dist/index.js`, health check `/healthz`, env vars as above.
3. **Netlify:** base `apps/mobile`, build `npx expo export --platform web`, publish `apps/mobile/dist`, set `EXPO_PUBLIC_API_URL`; add the site origin to the API's `CORS_ORIGIN`.
4. **APK:** `cd apps/mobile && eas build -p android --profile preview` (the profile sets `buildType: "apk"` so it can be sideloaded). Attach to a GitHub Release.
