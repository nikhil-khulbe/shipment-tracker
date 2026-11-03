# Progress — Shipment Tracker

Status as of this session. Full design spec, schema, and rationale live in `PLAN.md` — read that first if picking this back up cold. This file is just "what's actually built" vs. "what's left."

## Done

### Backend (`apps/api`) — functionally complete
- TypeScript + Express 5 + Apollo Server 5 + Mongoose 8 + JWT, exactly per `PLAN.md`.
- `domain/status.ts` — the status state machine (`canTransition`), framework-free.
- `models/Shipment.ts`, `models/Admin.ts` — with the unique indexes from the plan.
- `services/authService.ts` (bcrypt + JWT), `services/shipmentService.ts` (tracking-ID retry on collision, `updateStatus` as an atomic compare-and-swap so a race can't silently double-append history).
- `errors.ts` (all 6 error codes + `requireAdmin`), `context.ts`, `schema.ts`, `resolvers/*`, `index.ts` (CORS, prod error masking, introspection off outside dev, `/healthz`).
- `scripts/seedAdmin.ts` — upserts from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`.
- **Tests: `npm test -w api` → 6/6 passing** (Jest + mongodb-memory-server). Covers the public query, auth-required create, legal + illegal transitions (asserting the illegal one leaves state untouched), and login's identical error for bad-password vs. unknown-email.
- Manually verified over real HTTP against your local MongoDB service (`curl`): health check, unauthenticated rejection, login, create, status advance, illegal-transition rejection, public lookup — all correct.

### Mobile app (`apps/mobile`) — functionally complete
- Expo SDK 58 + TypeScript, React Navigation (bottom tabs: Track / Admin), Apollo Client v4.
- `apollo.ts` (authLink + errorLink), `auth/token.ts` (SecureStore, with a documented localStorage fallback on web).
- `TrackScreen` (search, header card, timeline, pull-to-refresh, idle/loading/not-found/loaded states) and `AdminScreen` (login, create-shipment, update-status with a chip row that shows the whole status enum but only lets you tap the one legal next step).
- `npx tsc --noEmit` clean.
- **Manually driven in Chrome** (web build) against the live local API: full loop — track → log in → create shipment → advance status → confirmed Track tab updates automatically → log out. No console errors from the app.

### Repo
- npm workspaces monorepo, `.gitignore` correct (`.env`, `node_modules` both confirmed ignored).
- 5 commits, each a logical unit (see `git log --oneline`). Nothing uncommitted.

## One real bug found and fixed along the way
Mongoose 9.x (the current "latest") bundles a driver incompatible with the `mongodb-memory-server` test binary — handshake failed with `Missing required sub-document 'driver'`. Downgraded to **mongoose 8.24.8** (the plan's original target anyway) and tests went from hanging/failing to passing in ~4s. Worth remembering if you ever bump mongoose later.

## Not started yet

1. ~~README.md~~ — written (setup, env tables, tests, design decisions, limitations). Still has TODO placeholders for live URL, APK link, and GIF/screenshots.
2. **Screenshots + demo GIF** for the README — none saved into `docs/screenshots/` yet.
3. `apps/mobile/eas.json` added (APK preview profile); its `EXPO_PUBLIC_API_URL` is a placeholder to replace with the Render URL.
4. **Deployment** — Atlas cluster, Render web service, Netlify web build, EAS APK build. All need your accounts/credentials, so this has to be driven by you or done together live; I documented the exact steps + env vars in `PLAN.md` §7 already.
4. The optional 6th test (pure unit test over the full 5×5 `canTransition` matrix) — already written, actually, it's test #6 in the suite. So this one's done too, just noting it in case the count looks off against the plan's "4-5 tests."

## To pick this back up

```bash
cd apps/api && npm run dev     # needs .env — see .env.example; local MongoDB service is already running on this machine
cd apps/mobile && npm start    # needs .env — see .env.example (EXPO_PUBLIC_API_URL)
```

Local `.env` files already exist on disk from this session (gitignored, not committed) pointing at `localhost:27017` / `localhost:4000` — they should still work as-is.

Next session: start with the README (I have everything needed to write it — design decisions, env vars, and test output are all already known from this session), then screenshots, then deployment whenever you're ready to drive the account-creation parts.
