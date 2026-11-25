'use strict';

/**
 * Fresh Reviews Popup — backend service (v1 foundation)
 *
 * Standard library only (node:http). Run:  node server.js
 * Local dev with sample data:              MOCK=1 node server.js
 *
 * Routes:
 *   GET  /api/reviews?placeId=...   Reviews JSON for the widget (cached 24h
 *                                    per place; see cache.js). This is the
 *                                    same JSON shape the widget core consumes.
 *   GET  /api/places/search?q=...   Place lookup for the app settings screen.
 *   GET  /api/plan?instanceId=...   STUB: plan/entitlement check (TODO).
 *   POST /webhooks/wix/app-installed   STUB (TODO).
 *   POST /webhooks/wix/app-removed     STUB (TODO).
 *   GET  /health                    { ok: true, source: 'places'|'mock' }
 *   GET  /preview/  and  /widget/   Static files for local development.
 *
 * In production the widget runs on customer sites, so /api/* answers with
 * Access-Control-Allow-Origin: *. Nothing secret is ever returned: the
 * Google API key stays server-side.
 *
 * Configuration (environment; see .env.example):
 *   PORT                 default 4173
 *   GOOGLE_PLACES_API_KEY  required unless MOCK=1
 *   MOCK=1               use the sample fixture instead of Google
 *   CACHE_FILE           default ./cache.json
 *   CACHE_TTL_MS         default 86400000 (24h)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { createDataSource } = require('./data-source');
const { TtlCache } = require('./cache');

// Minimal .env loader (KEY=VALUE lines) so there are zero dependencies.
(function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch (e) { /* no .env file: fine */ }
})();

const PORT = parseInt(process.env.PORT || '4173', 10);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || String(24 * 60 * 60 * 1000), 10);
const CACHE_FILE = process.env.CACHE_FILE || path.join(__dirname, 'cache.json');

const { source, kind } = createDataSource(process.env);
const cache = new TtlCache({ file: CACHE_FILE, ttlMs: CACHE_TTL_MS });

const APP_ROOT = path.join(__dirname, '..');
const STATIC_DIRS = {
  '/preview/': path.join(APP_ROOT, 'preview'),
  '/widget/': path.join(APP_ROOT, 'widget')
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  }, extraHeaders || {}));
  res.end(body);
}

async function handleReviews(req, res, url) {
  const placeId = url.searchParams.get('placeId');
  if (!placeId) {
    return sendJson(res, 400, { error: 'Missing required query parameter: placeId' });
  }
  const cacheKey = 'reviews:' + placeId;
  const cached = cache.get(cacheKey);
  if (cached) {
    return sendJson(res, 200, cached, { 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'HIT' });
  }
  try {
    const payload = await source.getPlaceReviews(placeId);
    cache.set(cacheKey, payload);
    return sendJson(res, 200, payload, { 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'MISS' });
  } catch (err) {
    return sendJson(res, 502, { error: String(err && err.message ? err.message : err) });
  }
}

async function handlePlaceSearch(req, res, url) {
  const q = url.searchParams.get('q');
  if (!q) {
    return sendJson(res, 400, { error: 'Missing required query parameter: q' });
  }
  try {
    const results = await source.searchPlaces(q);
    return sendJson(res, 200, { results });
  } catch (err) {
    return sendJson(res, 502, { error: String(err && err.message ? err.message : err) });
  }
}

function handlePlanStub(req, res, url) {
  // TODO(plan-gating): look up the Wix app instance (instanceId) and return
  // its current plan so the settings UI and widget can gate features
  // (refresh frequency, locations count, branding). Until Wix billing is
  // wired, every instance is treated as the free plan by the clients.
  return sendJson(res, 501, {
    error: 'Not implemented yet',
    todo: 'Resolve instanceId to a Wix billing plan via the Wix App Instances API.'
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

async function handleWixWebhookStub(req, res, url) {
  const body = await readBody(req);
  // TODO(wix-webhooks): verify the webhook signature with the app's public
  // key from the Wix Dev Center, parse the instanceId, and:
  //   app-installed: create the instance record (site -> placeId unset,
  //     plan = free) so settings can be completed.
  //   app-removed:   delete the instance record and purge its cached
  //     payloads (cache.delete('reviews:' + placeId)) so we stop fetching
  //     Google data for sites that uninstalled.
  console.log('[stub] Wix webhook received:', url.pathname, body.slice(0, 200));
  return sendJson(res, 501, {
    error: 'Not implemented yet',
    todo: 'Verify Wix webhook signature and persist/remove the app instance.'
  });
}

function serveStatic(req, res, url) {
  for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
    if (!url.pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(url.pathname.slice(prefix.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const filePath = path.normalize(path.join(dir, rel));
    if (!filePath.startsWith(dir)) return sendJson(res, 403, { error: 'Forbidden' });
    fs.readFile(filePath, (err, data) => {
      if (err) return sendJson(res, 404, { error: 'Not found: ' + url.pathname });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, source: kind });
    }
    if (req.method === 'GET' && url.pathname === '/api/reviews') {
      return await handleReviews(req, res, url);
    }
    if (req.method === 'GET' && url.pathname === '/api/places/search') {
      return await handlePlaceSearch(req, res, url);
    }
    if (req.method === 'GET' && url.pathname === '/api/plan') {
      return handlePlanStub(req, res, url);
    }
    if (req.method === 'GET' && (url.pathname === '/settings' || url.pathname === '/settings.html')) {
      // The app settings panel (Wix settings action button Panel URL).
      const settingsPath = path.join(__dirname, 'settings.html');
      return fs.readFile(settingsPath, (err, data) => {
        if (err) return sendJson(res, 404, { error: 'Settings page not installed' });
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
    }
    if (req.method === 'GET' && url.pathname === '/widget.js') {
      // The hosted widget script (Wix Custom Element script URL). The file
      // sits next to server.js in the repo/deployment root.
      const widgetPath = path.join(__dirname, 'reviews-widget-core.js');
      return fs.readFile(widgetPath, (err, data) => {
        if (err) return sendJson(res, 404, { error: 'Widget script not installed' });
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(data);
      });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/webhooks/wix/')) {
      return await handleWixWebhookStub(req, res, url);
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(302, { Location: '/preview/' });
      return res.end();
    }
    if (req.method === 'GET' && serveStatic(req, res, url)) return;
    return sendJson(res, 404, { error: 'Not found: ' + url.pathname });
  } catch (err) {
    return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, () => {
  console.log('Fresh Reviews Popup server listening on http://localhost:' + PORT +
    ' (data source: ' + kind + ', cache TTL ' + CACHE_TTL_MS + 'ms)');
});
