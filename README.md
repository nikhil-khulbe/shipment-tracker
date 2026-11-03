# Shipment Tracker

A courier-tracking app (think Delhivery / Blue Dart): anyone can look up a parcel by tracking ID and see its timeline; an admin can log in, create shipments and advance their status. Built as a full-stack TypeScript monorepo — **GraphQL API + React Native (Expo) app** that runs on Android, iOS and web.

> **Live demo:** _TODO — add Netlify URL after deploy_ · **Android APK:** _TODO — add GitHub Release link_
> The API runs on a free Render instance and sleeps when idle — the first request can take 30–50 s to wake it.

_Demo GIF and screenshots: TODO (`docs/screenshots/`)._

## Stack

| Layer | Tech |
|---|---|
| API | Node, Express 5, Apollo Server 5, GraphQL, Mongoose 8, MongoDB |
| Auth | JWT (HS256, 8h) + bcrypt |
| App | Expo (React Native), TypeScript, Apollo Client, React Navigation (bottom tabs) |
| Tests | Jest, ts-jest, mongodb-memory-server |
| Deploy | MongoDB Atlas, Render (API), Netlify (web), EAS (APK) |

## Features

- **Public:** `shipment(trackingId)` query → current status + full timeline.
- **Admin (JWT):** `login`, `createShipment`, `updateStatus`, `me`.
- **Status state machine:** `CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`, one step forward at a time, `DELIVERED` is terminal. Illegal moves are rejected with `INVALID_STATUS_TRANSITION`.
- Status history is append-only.

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
| `CORS_ORIGIN` | comma-separated allowed browser origins (needed for the web build) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | only read by `npm run seed` |

**App (`apps/mobile/.env`)**

| Var | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | GraphQL endpoint. Inlined into the bundle at build time — public, never put secrets here |

## Tests

```bash
npm test -w api
```

Six tests run through `ApolloServer.executeOperation` against an in-memory MongoDB, so schema, context and error formatting are all exercised:

1. Public `shipment` query returns full history, and `null` for an unknown ID.
2. `createShipment` requires auth (and writes nothing without it); creates a correct initial state.
3. `updateStatus` advances legally and appends to history.
4. `updateStatus` rejects an illegal transition **and leaves the document unchanged**.
5. `login` succeeds, and fails with an identical error for wrong password vs. unknown email.
6. `canTransition` over the full 5×5 matrix (pure unit test).

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
- **Mongoose pinned to 8.x.** Mongoose 9's bundled driver failed its handshake against the `mongodb-memory-server` binary; 8.x works.
- **Deliberately not used:** Redux/Zustand (Apollo cache + local state is enough), a UI kit, form libraries, `type-graphql`, DataLoader (`history` is embedded, so no N+1).

## Known limitations / what I'd do next

- Single seeded admin; no signup, password reset or roles.
- Atlas free tier with a `0.0.0.0/0` allowlist (Render's free tier has no static IP) — the real fix is private networking on a paid tier.
- JWT in `localStorage` on web; an httpOnly cookie would be better there but doesn't suit a shared native client.
- Next: GraphQL subscriptions for live status, admin list with pagination, rate limiting on `login`, graphql-codegen for shared types, CI running the tests, structured logging.

## Deployment (summary)

1. **Atlas:** M0 cluster (Mumbai), user scoped to `shipment_tracker`, network access `0.0.0.0/0`. Run the seed against it.
2. **Render:** root dir `apps/api`, build `npm install && npm run build`, start `node dist/index.js`, health check `/healthz`, env vars as above.
3. **Netlify:** base `apps/mobile`, build `npx expo export --platform web`, publish `apps/mobile/dist`, set `EXPO_PUBLIC_API_URL`; add the site origin to the API's `CORS_ORIGIN`.
4. **APK:** `cd apps/mobile && eas build -p android --profile preview` (the profile sets `buildType: "apk"` so it can be sideloaded). Attach to a GitHub Release.
