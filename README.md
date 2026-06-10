# Fair — Working Demo (tested end-to-end)

A real, runnable slice of Fair: scan → product lookup (live OpenFoodFacts) →
price comparison → green/yellow/red fairness verdict → buy links → watchlist →
GDPR export → in-app account deletion.

**What's real vs. seeded — read this once:** product metadata comes live from
OpenFoodFacts (with retry + built-in fallback for the three demo products,
because we watched a known-good UPC fail between two runs — it's a live
crowdsourced API). **Store prices are seeded demo data** (180 days of realistic
history per store), *not* live retailer prices. Live retailer pricing is a
legal + affiliate-API decision documented in `Fair_Submission_Readiness.docx`.

---

## Path 1 — Instant (0 setup)
Open `fair-demo-preview.html` in any browser (works on your phone). It replays
real captured API output. Tap the three sample chips: Coca-Cola → GREEN,
Jif → YELLOW, Cheerios at $6.19 → RED.

## Path 2 — Real API on your Mac (2 commands)
```bash
cd fair-demo
docker compose up --build        # seeds live from OpenFoodFacts, starts API on :8000
```
Then on your phone (same Wi-Fi): open `http://<YOUR-MAC-IP>:8000/demo`
(`ipconfig getifaddr en0` to find the IP). API docs: `http://localhost:8000/docs`

No Docker? `cd api && pip install -r requirements.txt && python seed.py && uvicorn main:app --host 0.0.0.0 --port 8000` (uses SQLite, zero config).

Re-verify anytime: `cd api && python smoke_test.py`

## Path 3 — The actual iOS app
```bash
cd mobile-demo
npx expo install                 # pins deps to your SDK
echo "EXPO_PUBLIC_API_URL=http://<YOUR-MAC-IP>:8000/api" > .env
npx expo run:ios                 # builds the native project, opens simulator/Xcode
```
Scan a real barcode in your kitchen — UPC normalization means iOS's 13-digit
codes resolve against 12-digit database entries. To fold into your main repo:
copy `app/`, `lib/`, and the `ios.infoPlist` block of `app.json`.

> Your old generated code used `expo-barcode-scanner`, which was **removed**
> from the Expo SDK — that's likely a chunk of your Xcode pain. These screens
> use `expo-camera`'s `CameraView`, the current API.

---

## 10-minute test plan
1. Scan/enter `049000050103` → Coca-Cola, GREEN.
2. Enter `016000275270` with shelf price `6.19` → RED, and note the
   explanation: only 34% above *nearby best* while ~level with the store's own
   30-day median — that's a sustained dynamic-pricing spike being caught. This
   is your pitch, working.
3. Enter `051500255162` → YELLOW (13% creep pushed price above the 6-month p90).
4. Enter `0049000050103` (13 digits) → still resolves (UPC normalization).
5. Hit `/docs`, register, add to watchlist, call `GET /api/privacy/export`,
   then `DELETE /api/auth/account` → token dies (Apple 5.1.1(v) requirement).
6. Scan something random from your pantry → live OpenFoodFacts lookup; expect
   messy crowdsourced names and occasional misses (real data-quality work ahead).

## Deliberately NOT in this demo
No scrapers (legal decision first — see readiness doc) · no push alerts (needs
APNs) · no premium/IAP · affiliate links are plain until your tags exist (set
`AMAZON_AFFILIATE_TAG` etc. and they upgrade automatically) · display-name
cleanup for OpenFoodFacts' messy titles.

## Layout
```
fair-demo/
├── docker-compose.yml        # Postgres + API, auto-seeds
├── fair-demo-preview.html    # Path 1: zero-setup preview
├── api/                      # FastAPI: main.py, db.py, services.py, seed.py, smoke_test.py
│   └── static/demo.html      # served at /demo
└── mobile-demo/              # Expo Router app: scan + comparison screens
```

## Path 4 — Live URL on Vercel (after pushing to GitHub)
Vercel dashboard → Add New → Project → import this repo → Deploy. No settings
needed (`vercel.json` handles routing; the pre-seeded demo DB ships in-repo).
Every future push auto-deploys. The root page auto-detects the live API.
