# Progress — Shipment Tracker

`PLAN.md` has the original design. `README.md` is the up-to-date description of what the app does, how to run it and why it is built this way. This file is only "what is built, what is verified, what is left".

## Built

**API (`apps/api`)** — TypeScript, Express 5, Apollo Server 5, Mongoose 8, JWT.
- Status state machine with exception states (delayed, on hold, failed attempt, returned, cancelled), atomic compare-and-swap updates, append-only history.
- Roles (ADMIN / DRIVER) checked against the DB per request; field masking per role.
- Proof of delivery (recipient name + 4-digit code), audit trail, edit with change log.
- Dashboard stats, bulk status update, CSV import, cursor-paginated admin list.
- Rate limits, query depth limit, structured JSON logs (pino), production error masking.
- **37 tests** passing.

**App (`apps/mobile`)** — Expo SDK 58, React Native, Apollo Client 4.
- Track screen: timeline, progress, ETA wording, My shipments, Route link, share, deep links, offline cache, polling.
- Admin: login gate, dashboard, create / edit / update, bulk select, CSV import, QR label printing, camera scanner.
- Hindi / English (customer screens), accessibility pass, light/dark theme.
- Types generated from the API schema (`npm run codegen`).
- **47 tests** passing.

**CI:** generated-types check, typecheck of both apps, API tests, app tests.

## Verified by hand

- API over real HTTP: locked mode, role checks, rate limit (429 on the 11th login attempt), log output.
- App in Chrome (web): Track (including a delayed shipment), Hindi toggle and its persistence, Overview dashboard, Update + Edit, bulk select, CSV import, My shipments, Save / Route / Share, QR label modal.

## Not verified

- The QR **scanner** (needs a camera), the browser **print dialog**, haptics, and the offline banner.
- Anything on a physical phone or in an EAS-built APK.
- Staff login in the UI against a seeded Atlas database, and the DRIVER view in the app (the DRIVER rules are covered by API tests).
- The Admin screens in Hindi (not translated).

## Left out on purpose

Push notifications, GraphQL subscriptions, Sentry, photo proof of delivery, an in-app map. See "Known limitations" in the README for why and what each would need.

## Left to do (needs your accounts)

1. Seed Atlas: `npm run seed -w api` with `MONGODB_URI`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (optionally `SEED_DRIVER_*`). Existing shipments need no migration.
2. Render: redeploy the API; make sure `JWT_SECRET` is set. `REQUIRE_ADMIN` defaults to `true`, so staff will have to log in.
3. Netlify: redeploy the web build with `EXPO_PUBLIC_API_URL`; put its origin in the API's `CORS_ORIGIN`.
4. EAS: build the APK and attach it to a GitHub Release.
5. README: fill in the live URL, APK link and a demo GIF.

## To pick this back up

```bash
npm install
cp apps/api/.env.example apps/api/.env       # edit values
cd apps/api && npm run dev                   # http://localhost:4000/graphql
cd apps/mobile && npx expo start             # press w for web
npm run codegen                              # after changing apps/api/src/schema.ts
```
