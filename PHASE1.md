# Fair — Phase 1: Hybrid MVP build

> Decision record (2026-06-11, Sean): MVP ships **free + affiliate**, pivot to
> IAP after proven. **Crowdsourced prices are the viral loop.** Apple Developer
> account exists; Sean handles affiliate approvals + APNs keys. Sean builds the
> iOS binary on his Mac (Xcode); this repo must always pass preflight first.

## Salvage map (from the 4 prior build generations)
- **Base = June core** (this repo): live OpenFoodFacts lookup, fairness engine
  (incl. nearby-premium detection), UPC normalization, JWT auth, watchlist,
  GDPR export, account deletion. Deployed: https://fair-app-iota.vercel.app
- **Grafted from the May build**: SecureStore auth-context pattern, login /
  register screens, `eas.json` build profiles, `check-release-env.mjs`
  preflight (rejects localhost / non-HTTPS API URLs in release builds).
- **Discarded**: Dec/Jan "OKComputer" generation (used the removed
  `expo-barcode-scanner`); the RN+Firebase template spec (wrong stack).

## What Phase 1 adds (this branch)
Mobile (`mobile-demo/`):
- `lib/auth.tsx` — AuthContext, SecureStore token, session restore.
- `lib/api.ts` — authed client: register/login/me, watchlist CRUD,
  price submission, GDPR export, account deletion.
- `app/login.tsx`, `app/register.tsx` (modal), `app/watchlist.tsx`,
  `app/account.tsx` (export + Apple 5.1.1(v) delete).
- `app/product/[upc].tsx` — **Watch** + **Share shelf price** actions
  (the crowdsource loop). Scan/compare stay public; auth only to save.
- `eas.json` + `scripts/check-release-env.mjs` + `tsconfig.json` + preflight
  npm scripts.

Design rule: scanning and comparison NEVER require sign-in. Auth is asked for
at the moment of saving — lowest-friction viral loop.

## Verify
```bash
# Backend (unchanged in this phase) — should return healthy + counts
curl https://fair-app-iota.vercel.app/api/health
# Mobile, on the Mac:
cd mobile-demo && npx expo install && npm run typecheck && npx expo run:ios
```

## Phase 1 remaining / Phase 2 queue
1. **Hosted Postgres** for production (Vercel SQLite writes don't persist
   across cold starts — crowdsourced submissions need real persistence).
   Candidate: Supabase (account exists) or Neon; swap via `DATABASE_URL`.
2. **Affiliate tags** — env-only switch, wiring exists in
   `api/services.py:affiliate_link()`. Blocked on Sean's program approvals
   (Amazon Associates → PA-API, Walmart via Impact, Target via Impact).
3. **Push (APNs)** price alerts — needs Sean's APNs key; server job to
   evaluate watchlist targets (May build's Celery skeleton is the reference).
4. Real app icon/splash; App Store metadata; privacy policy + ToS.
5. Rate limiting + locked CORS on the API before scale.
