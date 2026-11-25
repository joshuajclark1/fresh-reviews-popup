# Fresh Reviews Popup — backend service

Fetches each customer's Google rating, total review count, and recent
reviews from the Google Places API (New), caches them per place for 24
hours, and serves clean JSON to the widget. One app-wide API key lives
here, server-side; customers never see or handle a key.

Standard library only. No `npm install` needed. Node 18+ (uses global
`fetch`).

## Run it

Local development with sample data (no Google key, no network calls):

```sh
cd server
MOCK=1 node server.js
# then open http://localhost:4173/preview/
```

Against the real Google API:

```sh
cd server
cp .env.example .env   # fill in GOOGLE_PLACES_API_KEY
node server.js
```

## Endpoints

| Route | Status | Purpose |
|---|---|---|
| `GET /api/reviews?placeId=...` | working | Widget data. Cached 24h per place (`X-Cache: HIT/MISS`). |
| `GET /api/places/search?q=...` | working | Place lookup for the settings screen (Text Search). Mock returns one sample result. |
| `GET /api/plan?instanceId=...` | stub (501) | Plan/entitlement check for gating. TODO: Wix App Instances API. |
| `POST /webhooks/wix/app-installed` | stub (501) | TODO: verify signature, create instance record. |
| `POST /webhooks/wix/app-removed` | stub (501) | TODO: verify signature, delete instance, purge its cache entries. |
| `GET /health` | working | `{ ok, source }` liveness check. |

## Layout

- `server.js` — HTTP server, routes, CORS, local static serving of
  `../preview` and `../widget`.
- `data-source.js` — the DataSource interface + factory. v2's Google
  Business Profile OAuth source must implement the same two methods.
- `places-source.js` — Places API (New) implementation; fetch/normalize
  ported from the production bespoke backend. Note the hard API cap of
  5 reviews per place.
- `mock-source.js` + `sample-data.json` — development fixture shaped like
  a real verified response (rating 5, count 392, 5 reviews).
- `cache.js` — per-key TTL cache, in-memory with JSON file persistence.

## Configuration

See `.env.example`: `PORT`, `GOOGLE_PLACES_API_KEY`, `MOCK`,
`CACHE_FILE`, `CACHE_TTL_MS`. Real keys go in `.env` only (gitignored in
any real repo); never in code or in `.env.example`.
