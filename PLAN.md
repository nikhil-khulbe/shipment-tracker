# Shipment Tracker — Build Plan

## Context

You have ~13 months of full-stack experience and are applying for full-stack / React Native roles in Delhi NCR. Your resume claims React Native, Node, Express, GraphQL, MongoDB and TypeScript, but nothing on it *proves* those claims end to end. This project exists to be that proof: one small, finishable artifact where a reviewer can click a link, track a parcel, and see a real GraphQL API with auth, validation, tests and a deploy behind it.

The domain (courier tracking, à la Delhivery/Blue Dart) is chosen because it is instantly legible to an Indian interviewer and because it has one genuinely interesting rule — a status machine — which gives you something to talk about beyond CRUD.

The deliverable is a 3–5 day build you can explain line by line. Scope is frozen at: public tracking query + admin JWT login + create shipment + update status.

### Assumptions

1. Node 20+ and a recent npm are installed; you have GitHub, MongoDB Atlas, Render, Netlify and Expo accounts (all free tiers).
2. **One admin only**, seeded by script. No signup, no password reset, no roles beyond `admin`.
3. Tracking IDs are generated server-side (`SHP-` + 8 chars), not supplied by the admin.
4. Status history is append-only; nothing is ever edited or deleted.
5. Testing the **API resolvers** only. No React Native component tests — a reviewer will not value them enough to justify the Jest-for-RN setup cost.
6. Timeline events carry `status`, `timestamp`, `location`, optional `note`.
7. Shipment stays lean: `trackingId`, `origin`, `destination`, `receiverName`.
8. Design emphasis is **clean layering + tests**, per your answer — resolvers stay thin, logic lives in a service layer, transitions live in one pure function.
9. Delivery: Expo managed app → Netlify web link (resume-ready) + APK on GitHub Releases + demo GIF in README.

---

## 1. Repo layout — single monorepo with npm workspaces

**Recommendation: one repo, npm workspaces.** Reasons, in the order you'd say them in an interview:

- One link on the resume. A recruiter opening two repos and guessing which is "the project" is friction you don't want.
- The GraphQL schema is the contract between the two apps. In one repo you can share generated types; across two repos you'd either duplicate them or build a publishing step.
- npm workspaces ship with npm — no Turborepo/Nx/pnpm to explain or defend as over-engineering.

The one real cost: Render needs `rootDir: apps/api`, and Netlify needs `base: apps/mobile`. Both are a single field in the dashboard. Metro in a workspace can also hoist-confuse — mitigation in §10.

```
shipment-tracker/
├─ package.json                  # private: true, workspaces: ["apps/*"]
├─ README.md                     # screenshots, GIF, design decisions, live links
├─ .gitignore
├─ apps/
│  ├─ api/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ jest.config.js
│  │  ├─ .env.example
│  │  └─ src/
│  │     ├─ index.ts             # express + apollo bootstrap, mongo connect
│  │     ├─ config.ts            # reads+validates process.env, exported typed object
│  │     ├─ schema.ts            # typeDefs (SDL as a template literal)
│  │     ├─ context.ts           # builds GraphQLContext: { admin: AdminPayload | null }
│  │     ├─ errors.ts            # notFound(), unauthenticated(), forbidden(), invalidTransition()
│  │     ├─ models/
│  │     │  ├─ Shipment.ts
│  │     │  └─ Admin.ts
│  │     ├─ services/
│  │     │  ├─ shipmentService.ts   # all business logic, no GraphQL types in here
│  │     │  └─ authService.ts       # login, signToken, verifyToken
│  │     ├─ domain/
│  │     │  ├─ status.ts            # ShipmentStatus union + ALLOWED_TRANSITIONS + canTransition()
│  │     │  └─ trackingId.ts        # generateTrackingId()
│  │     ├─ resolvers/
│  │     │  ├─ index.ts
│  │     │  ├─ shipment.ts
│  │     │  └─ auth.ts
│  │     ├─ scripts/
│  │     │  └─ seedAdmin.ts
│  │     └─ __tests__/
│  │        ├─ setup.ts             # mongodb-memory-server lifecycle
│  │        ├─ helpers.ts           # executeOperation wrapper
│  │        └─ resolvers.test.ts
│  └─ mobile/
│     ├─ package.json
│     ├─ app.json                # expo config
│     ├─ tsconfig.json
│     ├─ .env.example             # EXPO_PUBLIC_API_URL
│     ├─ App.tsx                 # ApolloProvider + NavigationContainer
│     └─ src/
│        ├─ apollo.ts            # client + authLink reading SecureStore
│        ├─ graphql/
│        │  ├─ queries.ts
│        │  └─ mutations.ts
│        ├─ auth/
│        │  └─ token.ts          # saveToken/getToken/clearToken (SecureStore + web fallback)
│        ├─ screens/
│        │  ├─ TrackScreen.tsx
│        │  └─ AdminScreen.tsx
│        └─ components/
│           ├─ Timeline.tsx
│           ├─ StatusBadge.tsx
│           └─ ShipmentHeaderCard.tsx
└─ docs/
   └─ screenshots/
```

**Why `domain/` is its own folder:** `canTransition()` is a pure function with no Mongo and no GraphQL in it, which is exactly why it's trivial to unit test. That separation is the single best architecture talking point in the project — make it visible in the folder tree.

---

## 2. Data models

### `Shipment` (collection: `shipments`)

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | auto |
| `trackingId` | String | required, **unique index**, uppercase, immutable, `SHP-XXXXXXXX` |
| `origin` | String | required, trimmed, 2–80 chars |
| `destination` | String | required, trimmed, 2–80 chars |
| `receiverName` | String | required, trimmed, 2–80 chars |
| `currentStatus` | String | required, enum of the 5 statuses, default `CREATED` |
| `history` | `StatusEvent[]` | required, min length 1 (always seeded with the `CREATED` event) |
| `createdAt` / `updatedAt` | Date | `{ timestamps: true }` |

`StatusEvent` — a **subdocument schema with `_id: false`**:

| Field | Type | Rules |
|---|---|---|
| `status` | String | required, enum of the 5 |
| `location` | String | required, trimmed, 2–80 chars |
| `note` | String | optional, trimmed, max 200 |
| `timestamp` | Date | required, default `Date.now` |

**Indexes**
```ts
shipmentSchema.index({ trackingId: 1 }, { unique: true });   // the one that matters
shipmentSchema.index({ createdAt: -1 });                      // optional; only if you add an admin list later
```
Declare the unique index via `.index()`, not `unique: true` on the path — it keeps all index declarations in one place and makes it obvious in review. Call `Shipment.syncIndexes()` once on boot in non-production so the index actually exists locally.

**Why `currentStatus` is denormalised** even though `history[history.length - 1].status` would give it: the public read is "fetch one shipment by tracking ID and show its status" and a stored field makes that read trivially indexable and cheap. Be ready to say the tradeoff out loud: it's duplicated state, so **both writes happen in one `updateStatus` service call** and nowhere else.

### `Admin` (collection: `admins`)

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | auto |
| `email` | String | required, **unique index**, lowercase, trimmed |
| `passwordHash` | String | required, `select: false` so it never leaves the DB by accident |
| `createdAt`/`updatedAt` | Date | timestamps |

No `role` field — a document in `admins` *is* an admin. Adding a role enum for a single role is the kind of speculative generality interviewers notice.

---

## 3. GraphQL schema

```graphql
enum ShipmentStatus {
  CREATED
  PICKED_UP
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
}

type StatusEvent {
  status: ShipmentStatus!
  location: String!
  note: String
  timestamp: String!      # ISO-8601 string; see note below
}

type Shipment {
  id: ID!
  trackingId: String!
  origin: String!
  destination: String!
  receiverName: String!
  currentStatus: ShipmentStatus!
  history: [StatusEvent!]!
  createdAt: String!
  updatedAt: String!
}

type AuthPayload {
  token: String!
  email: String!
  expiresIn: Int!         # seconds, so the client can show "session expires in..."
}

input CreateShipmentInput {
  origin: String!
  destination: String!
  receiverName: String!
  originLocation: String  # label for the initial CREATED event; defaults to origin
}

input UpdateStatusInput {
  trackingId: String!
  status: ShipmentStatus!
  location: String!
  note: String
}

type Query {
  "Public. Returns null when no shipment matches."
  shipment(trackingId: String!): Shipment

  "Admin only. Confirms the token is still valid; used by the app on launch."
  me: AdminProfile
}

type AdminProfile {
  id: ID!
  email: String!
}

type Mutation {
  login(email: String!, password: String!): AuthPayload!
  createShipment(input: CreateShipmentInput!): Shipment!
  updateStatus(input: UpdateStatusInput!): Shipment!
}
```

**Timestamps as `String!`, not a custom `DateTime` scalar.** Deliberate: a scalar means `graphql-scalars` as a dependency and a conversation about serialisation you don't need. You return `date.toISOString()` and the app calls `new Date(s)`. Say this is a tradeoff you'd revisit on a real product — a `DateTime` scalar is correct there because it validates input dates too; here no date is ever an input.

**`shipment` returns nullable** — "no such tracking ID" is a normal outcome of a public lookup, not an error. Returning `null` lets the app render a clean empty state without parsing `errors[]`. Contrast with `updateStatus`, where a bad tracking ID *is* an error because an admin acting on a nonexistent shipment is a bug.

### Error cases

All errors thrown as `GraphQLError` with an `extensions.code`, from the single `errors.ts` module:

| Code | When | HTTP |
|---|---|---|
| `BAD_USER_INPUT` | Mongoose validation fails; blank/oversized fields | 400 |
| `UNAUTHENTICATED` | `login` credentials wrong; missing/invalid/expired token on an admin op | 401 |
| `FORBIDDEN` | Valid token whose `sub` no longer exists in `admins` | 403 |
| `NOT_FOUND` | `updateStatus` on an unknown `trackingId` | 404 |
| `INVALID_STATUS_TRANSITION` | e.g. `CREATED → DELIVERED`, or any change once `DELIVERED` | 400 |
| `DUPLICATE_TRACKING_ID` | Mongo E11000 on insert (retried 3× before surfacing) | 409 |
| `INTERNAL_SERVER_ERROR` | anything unhandled | 500 |

Two deliberate choices worth defending:
- **`login` returns `UNAUTHENTICATED` for both unknown email and wrong password** — identical message, so the endpoint can't be used to enumerate accounts.
- **In production, `formatError` strips stack traces** and replaces unrecognised messages with "Internal server error", while logging the real one server-side. One small function; a genuine security point.

Attach `extensions.http = { status: ... }` so the HTTP status matches the semantic error — nice detail, and it shows you know GraphQL-over-HTTP isn't always 200.

---

## 4. Auth design

**Seeding.** `apps/api/src/scripts/seedAdmin.ts`, run as `npm run seed -w api`. It reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, bcrypt-hashes the password with cost 10, and **upserts** so re-running is safe. It refuses to run if either var is missing. No credentials in the repo, ever — `.env` is gitignored and `.env.example` holds only key names. Run it once locally against Atlas, or once from the Render shell after first deploy.

> For the live demo, seed a *second*, read-flavoured admin and put those credentials in the README so a recruiter can log in. Create shipments freely; it's a demo. Say in the README that you'd never do this on a real system.

**JWT contents.** Signed HS256, `JWT_SECRET` (32+ random bytes), `expiresIn: "8h"`:

```json
{ "sub": "<admin _id as string>", "email": "admin@example.com", "iat": ..., "exp": ... }
```

Rationale to have ready:
- `sub` is the ID, not the email, so a changed email doesn't invalidate sessions.
- **No `role` claim.** Authorisation is "does this `sub` exist in `admins`" — a DB fact, so revoking access is a delete, not a wait for expiry.
- **No refresh token.** 8h ≈ a work shift; re-login is one screen. A refresh-token rotation story is the right answer for a real app and the wrong amount of code here — know both halves of that sentence.

**Enforcement.** Three layers, each boring:

1. `context.ts` runs per request: read `Authorization: Bearer <t>`, `jwt.verify` it, and on success set `context.admin = { id, email }`. On a malformed or expired token set `admin = null` — **never throw from context**, because that would break the public `shipment` query too.
2. `requireAdmin(context)` in `errors.ts`: throws `UNAUTHENTICATED` if `admin` is null, then `Admin.exists({ _id: admin.id })` and throws `FORBIDDEN` if gone. Returns the admin.
3. Every admin resolver's first line is `const admin = requireAdmin(ctx);`. One visible line per protected field. No directives, no middleware graph — you can point at it and explain it instantly.

Also: `express.json({ limit: "100kb" })`, and **disable introspection + the landing page in production** (`NODE_ENV === "production"`). Mention you'd add `graphql-depth-limit` or complexity analysis on a public internet-facing API; this schema is two levels deep so it isn't needed.

**Token storage in the app.** `expo-secure-store` (Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android). SecureStore has **no web implementation**, so `src/auth/token.ts` wraps it:

```ts
// Platform.OS === "web" ? localStorage : SecureStore
```

Call that out in the README as a known limitation of the web build — storing a JWT in `localStorage` is XSS-exposed; the correct production answer is an httpOnly cookie, which doesn't work for a native app sharing one API. That tension is a genuinely good interview answer.

Flow: `login` → save token → `authLink` (an Apollo `setContext` link) attaches it to every request → on launch, `me` validates it and the Admin screen either shows the forms or the login form. An `errorLink` catches `UNAUTHENTICATED`, clears the token, and drops you back to login.

---

## 5. Day-by-day build order

Each day ends with a check you can run; if it fails, don't start the next day.

### Day 1 — API skeleton, models, public query

1. `npm init -y` at root, add `"private": true` and `"workspaces": ["apps/*"]`.
2. `apps/api`: typescript, tsx, express, @apollo/server, graphql, mongoose, dotenv, zod-free hand-rolled `config.ts`. `tsconfig.json` with `strict: true`, `target: ES2022`, `module: NodeNext`, `outDir: dist`.
3. `domain/status.ts`: the status union, `ALLOWED_TRANSITIONS` map, `canTransition(from, to)`.
4. `models/Shipment.ts`, `models/Admin.ts` with the fields and indexes from §2.
5. Mongo connection (local `mongod` or an Atlas dev cluster — Atlas from day one saves you a surprise later).
6. `schema.ts` typeDefs, `shipment(trackingId)` resolver through `shipmentService.findByTrackingId`.
7. Insert one shipment by hand with `mongosh` or a throwaway script.

**Done check:** `npm run dev -w api`, open the Apollo Sandbox at `localhost:4000/graphql`, query that tracking ID, get a full `history` array back. Query a garbage ID, get `{"data":{"shipment":null}}` with no `errors` key.

### Day 2 — Auth and admin mutations

1. `authService.ts`: `login` (bcrypt compare, constant-ish failure path), `signToken`, `verifyToken`.
2. `scripts/seedAdmin.ts` + `npm run seed -w api`. Seed your admin.
3. `context.ts` and `requireAdmin`.
4. `errors.ts` with all the factories from §3, plus `formatError`.
5. `createShipment`: generate tracking ID, retry up to 3× on E11000, seed `history` with the `CREATED` event, return the doc.
6. `updateStatus`: load → `canTransition` → push event → set `currentStatus` → save. Use **one atomic `findOneAndUpdate` with `$push` and a `currentStatus` guard in the filter** so two simultaneous updates can't both append. (That guard is a real concurrency answer; see §9.)
7. `me` query.

**Done check:** in Sandbox — `login` returns a token; `createShipment` **without** the header fails with `UNAUTHENTICATED`; with the header it returns a `SHP-` ID; `updateStatus` to `IN_TRANSIT` from `CREATED` fails `INVALID_STATUS_TRANSITION`; to `PICKED_UP` succeeds and `history` has 2 entries. Paste a tampered token → `UNAUTHENTICATED`.

### Day 3 — Tests, then the Track screen

1. jest + ts-jest + mongodb-memory-server. `setup.ts` connects before all, clears collections between tests, stops after all.
2. Write the five tests from §6. Fix whatever they expose (they will expose something — usually the transition map or an error code).
3. `npx create-expo-app@latest apps/mobile --template blank-typescript` (let it pick the React Native version — never hand-pin RN under Expo).
4. `@apollo/client` + `graphql`, `src/apollo.ts`, `ApolloProvider` in `App.tsx`. API URL from `EXPO_PUBLIC_API_URL`.
5. `TrackScreen`: TextInput + Track button → `useLazyQuery` → `ShipmentHeaderCard` + `Timeline`. Handle all four states explicitly: idle, loading, not-found, loaded.
6. `Timeline.tsx`: a `FlatList` (or plain `.map()` — ≤5 items, so either is defensible; `.map()` is simpler and you should say why) with a dot-and-connecting-line layout, newest first, `StatusBadge` coloured per status, formatted date and the location/note beneath.

**Done check:** `npm test -w api` — 5 passing. On your phone/emulator, enter the real tracking ID and see the timeline; enter nonsense and see "No shipment found for that ID" with no crash and no red box.

### Day 4 — Admin screen, polish

1. `@react-navigation/native` + `native-stack` (+ its Expo peer deps), or **bottom-tabs** — two tabs, Track and Admin, is the better UX here and one less navigation concept to explain.
2. `AdminScreen`: if no token → login form; if token → create-shipment form (3 inputs) and update-status form (tracking ID + a status picker + location + note).
3. Status picker: a **row of `Pressable` chips** built from the enum, not `@react-native-picker/picker`. One less dependency, consistent on web and native, and it visually demonstrates the state machine if you grey out statuses that aren't reachable from the current one.
4. `errorLink` → clear token on `UNAUTHENTICATED`. Show server error messages inline under the form.
5. `refetchQueries` / `cache.writeQuery` after `updateStatus` so the Track screen is fresh. (Small but good: name the `shipment` query and refetch it rather than reaching into the cache manually.)
6. Pull-to-refresh on Track. `KeyboardAvoidingView` on the forms. Empty/loading states everywhere.

**Done check:** full loop with no code changes and no restart — log in on the Admin tab, create a shipment, copy its ID, advance it twice, switch to Track, paste, see three timeline events. Kill and relaunch the app: still logged in.

### Day 5 — Deploy, APK, README

1. Atlas production cluster + DB user + network access. Run the seed against it.
2. Render web service from `apps/api`. Set env vars. Verify the live endpoint from Sandbox.
3. Point `EXPO_PUBLIC_API_URL` at Render. `npx expo export --platform web` → deploy `dist/` to Netlify. Add `_redirects` (`/* /index.html 200`) if you added any deep linking.
4. `eas build -p android --profile preview` → download the APK → attach to a GitHub Release tagged `v1.0.0`.
5. Screenshots into `docs/screenshots/`. Record the loop (track → admin → update → track) and convert to a GIF under ~5 MB.
6. README: one-line pitch, live web link, APK link, demo GIF, demo credentials, stack, local setup, env var table, `npm test` output, **Design decisions** (the denormalised `currentStatus`; nullable `shipment` vs throwing; no refresh token; String timestamps over a scalar; atomic `findOneAndUpdate` for the transition; SecureStore-vs-localStorage on web), and a **Known limitations / what I'd do next** section.

**Done check:** open the Netlify link in a private window on your phone's browser, track the demo ID, and it works with zero local setup. The README links all resolve. `git log` reads like deliberate work, not one "initial commit".

> **If you're running out of time, drop in this order:** the APK (step 4) → the GIF (keep still screenshots) → the `me` query (ship a token that's simply assumed valid until a request 401s). Never drop the tests or the README's design-decisions section — those are the two things that actually differentiate you.

---

## 6. Test plan — five resolver tests

In `apps/api/src/__tests__/resolvers.test.ts`, driven through `ApolloServer.executeOperation` against `mongodb-memory-server`. Testing through the server (not by calling resolver functions directly) means the schema, context and error formatting are all exercised — strictly more value for the same effort.

1. **`shipment(trackingId)` returns the shipment with full history, and `null` for an unknown ID.** Seed one shipment with two events. Two assertions in one test — the happy read and the nullable-miss contract that the app depends on.
2. **`createShipment` requires auth and produces a correct initial state.** Without a token → `UNAUTHENTICATED` and zero documents written. With a seeded admin's token → `trackingId` matches `/^SHP-[A-Z0-9]{8}$/`, `currentStatus === "CREATED"`, `history.length === 1` and that event's status is `CREATED`.
3. **`updateStatus` advances legally and appends to history.** `CREATED → PICKED_UP` → `currentStatus` is `PICKED_UP`, `history.length === 2`, the new event carries the supplied `location` and `note`, and its `timestamp` is ≥ the first event's. Proves the two writes stay in sync.
4. **`updateStatus` rejects an illegal transition and changes nothing.** `CREATED → DELIVERED` → error code `INVALID_STATUS_TRANSITION`; then re-read the doc and assert `currentStatus` is still `CREATED` and `history.length` is still 1. The "changes nothing" half is what makes this a real test instead of an error-message test.
5. **`login` succeeds with the right password and fails identically for a wrong password and an unknown email.** Seed an admin with a known bcrypt hash. Assert a token comes back and that `jwt.verify` yields `sub === admin.id`; then assert both failure paths return `UNAUTHENTICATED` with the *same* message.

Optional sixth if you have 20 spare minutes: a pure unit test over `canTransition()` covering the whole 5×5 matrix. Cheap, fast, and shows you know the difference between a unit and an integration test — a good thing to be asked about.

**Set `testTimeout: 30000`** — the first `mongodb-memory-server` run downloads a MongoDB binary and will otherwise fail on a cold machine. Use `maxWorkers: 1` or a single `describe` so the shared in-memory DB isn't raced.

---

## 7. Deployment

### MongoDB Atlas

1. Free M0 cluster, region **Mumbai (ap-south-1)** — lower latency and a nice detail to mention.
2. Database user `shipment_api` with a generated password, scoped `readWrite` on database `shipment_tracker`.
3. Network access: Render's free tier has no static outbound IP, so `0.0.0.0/0`. **Say this out loud in the README** and note the real fix (VPC peering / Private Endpoint, which needs a paid tier) — an interviewer who spots an open allowlist will be pleased you spotted it first.
4. Connection string: `mongodb+srv://shipment_api:<pwd>@<cluster>/shipment_tracker?retryWrites=true&w=majority`. URL-encode any special characters in the password.

### Render (API)

- New → Web Service → connect the repo. **Root Directory: `apps/api`**.
- Build: `npm install && npm run build` (which is `tsc`). Start: `node dist/index.js`.
- Health check path `/healthz` — add a two-line Express route that returns `{ ok: true }`. Free instances sleep after 15 min of inactivity and take ~30–50s to wake; a health check doesn't prevent that, so **note the cold start in the README** so a recruiter's first click doesn't look like a broken app.
- Server must bind `process.env.PORT` and host `0.0.0.0`.

| Env var | Example | Notes |
|---|---|---|
| `NODE_ENV` | `production` | gates introspection + error masking |
| `PORT` | *(Render sets it)* | never hardcode |
| `MONGODB_URI` | `mongodb+srv://...` | secret |
| `JWT_SECRET` | 32+ random bytes, base64 | secret; `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | `8h` | |
| `CORS_ORIGIN` | `https://<site>.netlify.app` | comma-separated list; needed for the web build |
| `SEED_ADMIN_EMAIL` | `demo@shipment.dev` | only needed when running the seed |
| `SEED_ADMIN_PASSWORD` | *(strong)* | only needed when running the seed |

`config.ts` should throw on boot if `MONGODB_URI` or `JWT_SECRET` is missing — fail fast and loud beats a server that starts and 500s.

### Netlify (web build)

- Base directory `apps/mobile`, build `npx expo export --platform web`, publish `apps/mobile/dist`.
- Env var `EXPO_PUBLIC_API_URL=https://<service>.onrender.com/graphql`. `EXPO_PUBLIC_*` is inlined at build time, so a changed URL needs a rebuild — and anything in it is public, which is exactly why no secret ever goes there.
- The web origin must be in the API's `CORS_ORIGIN` or every request fails the preflight.

### EAS (APK)

- `npx expo install expo-dev-client` is **not** needed; you want a standalone preview build.
- `eas build:configure`, then an `eas.json` `preview` profile with `android.buildType: "apk"` (the default `app-bundle` produces an `.aab`, which a recruiter cannot sideload — this is the single most common mistake here).
- `eas build -p android --profile preview`, download, attach to a GitHub Release. Free-tier builds queue; start this early on Day 5, not at the end.
- Set `EXPO_PUBLIC_API_URL` in the `preview` profile's `env` so the APK points at Render, not `localhost`.

---

## 8. Libraries

Pin exact versions in `package.json` (no `^`) so your README's instructions keep working months from now. **Verify the current version of each with `npm view <pkg> version` on day one** rather than trusting the numbers below — ranges here are what to expect, not gospel.

**`apps/api`**

| Package | Expect | Why |
|---|---|---|
| `typescript` | 5.x | |
| `express` | **4.x** | Pair with `@apollo/server/express4`. Express 5 works via `@as-integrations/express5`, but 4.x matches the Apollo docs and the tutorials you'll search when stuck. |
| `@apollo/server` | 4.x or 5.x | 5.x needs Node 20+ and the express5 integration package; 4.x is the lower-friction choice. Either is defensible — know which you picked and why. |
| `graphql` | 16.x | peer of both |
| `mongoose` | 8.x | |
| `jsonwebtoken` | 9.x | + `@types/jsonwebtoken` |
| `bcryptjs` | 3.x | Pure JS — no native build step, so Render never fails on a node-gyp compile. `bcrypt` is marginally faster and not worth the risk here; be ready to say that. |
| `dotenv` | 17.x | `.env` locally only; Render injects directly |
| `cors` | 2.x | + `@types/cors` |
| `tsx` | 4.x | dev runner, `tsx watch src/index.ts`. Faster than ts-node and zero config. |
| `jest`, `ts-jest`, `@types/jest` | 30.x / 29.x | |
| `mongodb-memory-server` | 10.x | dev only |

Deliberately **not** used: `type-graphql` / Nexus (schema-first SDL is more readable and more commonly asked about), `graphql-codegen` on the API side, `zod` (Mongoose validators cover this scope), `helmet` (no browser-rendered HTML served), `winston` (`console` + Render's log stream is enough at this size). Be able to name one of these and say when you *would* add it.

**`apps/mobile`** — let `create-expo-app` and `npx expo install` choose versions. Never `npm install` a native-adjacent package in an Expo project; `expo install` picks the version matching your SDK, and ignoring that is the #1 cause of "it builds but crashes on launch".

| Package | Why |
|---|---|
| `expo` | SDK pinned by the template |
| `react`, `react-native` | versions chosen by the SDK — do not hand-pick |
| `@apollo/client` + `graphql` | useQuery/useLazyQuery/useMutation; its normalised cache is what makes the post-mutation refresh one line |
| `@react-navigation/native` + `@react-navigation/bottom-tabs` | two tabs |
| `react-native-screens`, `react-native-safe-area-context` | navigation peers, via `expo install` |
| `expo-secure-store` | token at rest on device |
| `expo-constants` | only if you read config from `app.json`; skip if `EXPO_PUBLIC_*` suffices |

Deliberately not used: Redux/Zustand (Apollo cache + two `useState`s is the whole state story — saying this well is worth more than using Redux), any UI kit (hand-written `StyleSheet` proves you can actually lay out a screen), Formik/RHF (four inputs), a date library (`toLocaleString` with options is enough; mention `date-fns` as the choice if formatting needs grew).

---

## 9. Interview questions this will trigger

**GraphQL**
- *Why GraphQL over REST here?* One round trip returns the shipment and its whole timeline; the app asks for exactly the fields it renders. Honest counterpoint: at this size REST would be fine — GraphQL pays off as clients multiply.
- *Query vs mutation — what actually differs?* Semantics plus execution: top-level mutation fields run serially, query fields can run in parallel.
- *What's the N+1 problem and do you have it?* It's one DB call per parent in a list resolver. I don't have it because `history` is embedded in the same document; if it were a separate collection I'd batch with DataLoader.
- *Why does `shipment` return null while `updateStatus` throws?* A missed public lookup is an expected outcome; an admin acting on a nonexistent shipment is a bug. Nullable for the former, error for the latter.
- *Where do GraphQL errors live in a response?* In the top-level `errors` array alongside partial `data`; the HTTP status is usually 200 unless I set `extensions.http`.
- *How would you secure a public GraphQL endpoint?* Disable introspection in prod, cap query depth and complexity, rate-limit, cap body size, mask internal errors.

**MongoDB / Mongoose**
- *Why embed `history` instead of a separate collection?* It's bounded (≤~10 events), always read with its parent, and never queried independently — the textbook embed case. I'd switch to referencing if it were unbounded or queried on its own.
- *Why store `currentStatus` when history implies it?* Cheap indexed reads on the hot path; the cost is duplicated state, which I contain by making one service method the only writer of both.
- *What does a unique index actually do?* Enforces uniqueness at the storage layer and rejects dupes with E11000 — which is why I catch E11000 rather than doing a find-then-insert, since that check-then-act has a race between the two calls.
- *Two admins update the same shipment at once — what happens?* `findOneAndUpdate` with the expected `currentStatus` in the filter makes it compare-and-swap: the second update matches nothing and I surface an invalid-transition error instead of silently appending two events.
- *Mongoose vs the native driver?* Schemas, validation and typed models; the cost is an abstraction layer and occasional fights with its types.

**Auth**
- *What's inside your JWT and why?* `sub` + `email` + `iat`/`exp`, HS256. No role claim — admin-ness is a DB fact, so revocation is a delete, not a wait for expiry.
- *Why 8 hours and no refresh token?* Matches a work session; refresh-token rotation is the right production answer and more code than this scope earns.
- *How do you revoke a token before it expires?* I can't invalidate the JWT itself — that's the tradeoff of stateless auth. I delete the admin row and the per-request existence check fails. A denylist or short-lived access + refresh is the general fix.
- *Why is the token in SecureStore and not AsyncStorage?* AsyncStorage is unencrypted plaintext on disk. SecureStore uses Keychain/Keystore. On web I fall back to `localStorage`, which is XSS-exposed — the correct answer there is an httpOnly cookie, which doesn't work for a native client on the same API.
- *Why bcrypt and not SHA-256?* Deliberately slow and per-password salted, so brute force is expensive; SHA-256 is fast by design, which is exactly wrong for passwords.

**Architecture / TypeScript**
- *Walk me through a request.* Express → Apollo → context verifies the JWT → resolver calls `requireAdmin` → service applies business rules → Mongoose writes → typed result serialised by the schema.
- *Why a service layer when the resolver could do it?* Resolvers stay thin and GraphQL-shaped; rules live in plain functions that are testable without a server and reusable from a script or a future REST route.
- *How do you keep the API and app types in sync?* Today, by hand — the schema is small. At any real size I'd run graphql-codegen against the SDL and generate the client hooks and types.
- *What does `strict: true` buy you?* Mostly `strictNullChecks` — a nullable `shipment` becomes a compile error if I forget to handle the miss, which is where that whole class of bug lives.

**React Native**
- *Why Expo over bare CLI?* No custom native code, so I lose nothing, and I gain `expo install` version alignment, EAS builds without a local Android SDK, and a web target for free. I'd eject/prebuild the moment I needed a native module Expo doesn't wrap.
- *FlatList vs map?* FlatList virtualises and is right for long or unbounded lists; with five items it's overhead, so I used `.map()` deliberately.
- *How does the app know a mutation changed data elsewhere?* Apollo's normalised cache plus a named `refetchQueries` on the mutation; `cache.writeQuery` would avoid the round trip at the cost of duplicating the merge logic.

**Project-level**
- *What would you do next?* GraphQL subscriptions for live status, an admin list with pagination, rate limiting on `login`, graphql-codegen, CI running the tests, structured logging.
- *What's the weakest part?* Single hardcoded admin, open Atlas IP allowlist on the free tier, and a token in `localStorage` on web. Naming your own weak spots before you're asked is the highest-value thing on this list.

---

## 10. Risks and known sticking points

1. **`mongodb-memory-server` first run.** Downloads a MongoDB binary; on a slow or proxied connection the first `npm test` times out and looks like a broken setup. Fix: `testTimeout: 30000`, run it once before you depend on it, and commit the version you used to `.gitignore`-adjacent docs.
2. **Metro and npm workspaces.** Hoisting puts `node_modules` at the repo root and Metro sometimes doesn't follow. If you hit "Unable to resolve module", add `watchFolders: [monorepoRoot]` and both `node_modules` dirs to `nodeModulesPaths` in `metro.config.js`. Budget an hour for this the first time.
3. **`localhost` from a device.** `http://localhost:4000` on a physical phone means the *phone's* localhost. Use your machine's LAN IP (`ipconfig`), same Wi-Fi, and keep the URL in `EXPO_PUBLIC_API_URL` so switching to Render later is a one-line change. Android emulator uses `10.0.2.2`.
4. **CORS on the web build only.** Native requests have no `Origin` header and sail through; the moment you deploy to Netlify, everything 403s on preflight. Configure `CORS_ORIGIN` before you blame the API.
5. **Mongoose `_id` vs GraphQL `id`.** `_id` is an ObjectId, and GraphQL `ID!` wants a string. Add a `transform` in `toJSON` or an explicit `id: (doc) => doc._id.toString()` resolver. Forgetting this gives a confusing serialisation error.
6. **Apollo Server 4 vs 5 and Express 4 vs 5.** Mixing them gives type errors and `expressMiddleware` import failures that read as mysterious. Pick AS4 + Express 4 (or AS5 + `@as-integrations/express5`) and don't drift.
7. **`select: false` on `passwordHash`.** It's the right default, and it means your own `login` must explicitly `.select("+passwordHash")` or the bcrypt compare silently gets `undefined` and every login fails. A classic hour lost to a one-word fix.
8. **Render cold starts.** First request after idle takes ~30–50s. Say so in the README next to the live link, or your demo looks dead.
9. **EAS producing an `.aab`.** The default Android build type can't be installed by a recruiter. Set `buildType: "apk"` in the `preview` profile. Also: free-tier builds queue, so start early.
10. **`expo install` vs `npm install`.** Installing a native-adjacent package with plain npm gives a version mismatched to your SDK — it may build and then crash at launch. Always `npx expo install` in `apps/mobile`.
11. **Scope creep.** The tempting additions are maps, subscriptions, and a web admin dashboard. All three are already out of scope; a finished small project beats an impressive unfinished one, and interviewers read "chose to stop" as judgment.
12. **Git history.** One "initial commit" with everything in it undercuts the whole exercise. Commit per logical unit, with messages that read like decisions.

---

## Verification (end to end, once built)

1. `npm test -w api` → 5 (or 6) passing specs.
2. `npm run dev -w api` + Apollo Sandbox: the four Day-2 checks (unauthenticated create, legal transition, illegal transition, tampered token).
3. `npx expo start` in `apps/mobile`: full loop on a device — log in, create, advance twice, track, relaunch and confirm the session persists.
4. Live: open the Netlify URL in a private window, track the demo ID, see the timeline. Then log in with the demo admin and advance a shipment, to prove auth works against the deployed API.
5. Install the APK from the GitHub Release on a physical Android device and repeat step 3 against production.
6. Read your own README top to bottom as if you'd never seen the project, with every link clicked.

---

# Phase 2 — Polish and advanced features

> **Supersedes** the "scope is frozen" line in Context. Phase 1 (everything above) is built and committed; this phase is a deliberate, ordered extension. Rule from §10 still applies: finish and commit each batch before starting the next, and README + deploy still ship even if a later batch is dropped.

## Batch A — Stylish (mobile only, no API change)

| # | Item | Approach |
|---|---|---|
| A1 | **Theme + dark mode** | One `theme.ts` with `light` and `dark` palettes (same keys); `useTheme()` reads `useColorScheme()`. All screens/components take colours from it — no hex literals in components. `app.json` `userInterfaceStyle` → `automatic`. |
| A2 | **Inter font** | `@expo-google-fonts/inter` + `expo-font`; gate first render on `useFonts`, keep splash until loaded. Weights 400/500/600/700 only. |
| A3 | **Icon status badges** | Per-status Ionicons (create=`cube`, picked up=`bag-check`, transit=`car`/truck, out for delivery=`bicycle`, delivered=`checkmark-circle`) shown in `StatusBadge` and on the timeline rail. |
| A4 | **Skeleton loaders** | `Skeleton` primitive (reanimated pulsing opacity) → `ShipmentSkeleton` shaped like header card + 3 timeline rows; replaces `ActivityIndicator` on Track. |
| A5 | **Animated timeline** | `react-native-reanimated` `FadeInDown.delay(index * 80).springify()` per event; progress bar (5 segments) under the header card animates width to `statusIndex / 4`. |
| A6 | **Haptics + toasts** | `expo-haptics` (light on successful track, success notification on update) and `react-native-toast-message` ("Status updated to In Transit", errors). Toast themed from A1. |

Install with `npx expo install` only. Reanimated needs its Babel/worklets support — verify the app still bundles on web *and* Android after A4.

**Done check:** toggle device dark mode → whole app flips without a reload; track a shipment → skeleton, then events slide in one by one and the bar fills; advance status → haptic + toast.

## Batch B — Behaviour (mobile, small API-free changes)

| # | Item | Approach |
|---|---|---|
| B1 | **Polling + "Updated just now"** | `useQuery` with `pollInterval: 30000`, paused when app is backgrounded (`AppState`) or no tracking ID. "Updated Xs ago" label ticks from `dataUpdatedAt`-style timestamp. Pull-to-refresh retained. Interview answer: polling over subscriptions because it needs no WebSocket infra on a free Render tier and status changes are minutes apart. |
| B2 | **Optimistic `updateStatus`** | `optimisticResponse` appends the predicted event + sets `currentStatus`; Apollo rolls it back automatically if the server rejects. Toast on rollback. |
| B3 | **Global auth error handling** | Extend existing `errorLink`: on `UNAUTHENTICATED` clear token **and** notify the Admin screen (tiny event emitter) so it drops to login immediately, with a "Session expired" toast — not only on next mount. |
| B4 | **Deep links + share** | React Navigation `linking` config: `shipmenttracker://track/SHP-XXXX` and (web) `/track/SHP-XXXX`. Track screen reads the `trackingId` route param and auto-runs the query. "Share tracking link" button via `Share.share`. Web build needs the Netlify `_redirects` SPA rule (§5 Day 5 already mentions it). README gets a working example link once deployed. |

**Done check:** open `/track/<id>` on web → result loads with no typing; advance a status → timeline updates before the network returns; expire/tamper token → bounced to login with a toast.

## Batch C — Admin shipment list (API + mobile)

New query: `shipments(status: ShipmentStatus, search: String, cursor: String, limit: Int = 20): ShipmentPage!` — **admin only**.

```graphql
type ShipmentPage { items: [Shipment!]!  nextCursor: String }
```

- **Cursor = opaque base64 of `{createdAt, _id}`**, sorted `createdAt desc, _id desc`; query `{ $or: [{createdAt < c}, {createdAt = c, _id < id}] }`. Not skip/limit — skip is O(n) and drifts when rows are inserted mid-scroll. Fetch `limit + 1` to know whether another page exists.
- **Index:** `{ currentStatus: 1, createdAt: -1 }` (status-filtered list) alongside the existing `{ createdAt: -1 }`. `search` = case-insensitive prefix match on `trackingId` (anchored, so it can use an index) — *not* an unanchored regex.
- Limit clamped to 1–50 server-side; invalid cursor → `BAD_USER_INPUT`.
- **Tests (resolvers.test.ts):** (7) list requires auth; (8) pagination returns every shipment exactly once across pages with no duplicates and a null `nextCursor` at the end, and the status filter excludes others. Suite becomes 8 tests.
- **Mobile:** Admin tab gets a list section: search box, status filter chips, `FlatList` with `onEndReached` → Apollo `fetchMore` (type-policy `keyArgs: ["status","search"]` merging `items`), tapping a row pre-fills the update form. FlatList is justified here (unbounded list) — contrast with the Timeline's `.map()`.

**Done check:** seed ~30 shipments; scroll loads pages; filter chips and search change the result set; tapping a row opens it for update; `npm test -w api` → 8 passing.

## Batch D — Offline resilience

- `apollo3-cache-persist` + `@react-native-async-storage/async-storage` (via `expo install`) persisting the Apollo cache; Track uses `cache-and-network` so the last result shows instantly and refreshes when online.
- **Recent searches:** last 5 tracking IDs in AsyncStorage → tappable chips under the search box.
- **Offline banner:** `@react-native-community/netinfo`, slide-in banner "You're offline — showing saved data".
- Caveat to state in README: **don't persist the admin token or admin list through the Apollo cache path** — token stays in SecureStore only; clear the persisted cache on logout.

**Done check:** track a shipment, enable airplane mode, relaunch → last result still renders with the offline banner.

## Order and cut line

A → B → C → D. If time runs short, drop **D**, then **B4's share button**, then **A2 (Inter)** — in that order. Never drop the README refresh: after each batch, update screenshots/GIF, the feature list, and the design-decisions section (add: theme tokens, polling vs subscriptions, cursor vs offset pagination, optimistic UI rollback, why cache persistence excludes auth data).

## New interview questions this phase triggers

- *Why polling instead of subscriptions?* No WebSocket infra needed; updates are minutes apart; trivial to explain and cheap. Subscriptions are the "what next".
- *Cursor vs offset pagination?* Offset is O(skip) and skips/duplicates rows when data changes mid-scroll; a `(createdAt, _id)` cursor is stable and index-backed.
- *How does an optimistic update roll back?* Apollo applies it to a separate optimistic layer of the cache; if the mutation errors, that layer is discarded — no manual undo code.
- *What should and shouldn't you persist offline?* Public shipment data yes; tokens and admin data no, and wipe on logout.
- *How do deep links work on native vs web?* Native: URL scheme registered in `app.json` + React Navigation `linking`; web: real URL paths with an SPA fallback rewrite.
