'use strict';

/**
 * DataSource interface
 * --------------------
 * Every reviews provider implements two async methods:
 *
 *   getPlaceReviews(placeId) -> Promise<{
 *     name: string,
 *     rating: number,          // e.g. 5.0
 *     count: number,           // total Google review count (live total)
 *     googleMapsUri: string,   // link to the place on Google Maps
 *     reviews: Array<{
 *       author: string,
 *       photo: string,         // reviewer avatar URL, may be ''
 *       rating: number,
 *       text: string,
 *       publishTime: string,   // ISO 8601
 *       relativeTime: string   // e.g. "2 months ago"
 *     }>,                      // newest first
 *     fetchedAt: string        // ISO 8601, when this payload was fetched
 *   }>
 *
 *   searchPlaces(query) -> Promise<Array<{
 *     placeId: string, name: string, address: string
 *   }>>
 *
 * Implementations:
 *   - PlacesDataSource (places-source.js) — v1. Google Places API (New).
 *     One app-wide API key, held server-side. Hard cap: 5 reviews per place.
 *   - MockDataSource (mock-source.js) — local development fixture.
 *
 * Planned v2:
 *   - GbpDataSource — Google Business Profile API behind customer OAuth
 *     ("Connect your Google business" in settings). Returns the full review
 *     history for profiles the customer manages, removing the 5-review cap.
 *     It must satisfy this same interface so the widget, cache, and routes
 *     do not change. Access requires Google approval of the API project and
 *     OAuth app verification; per-customer tokens replace the shared key.
 */

const { PlacesDataSource } = require('./places-source');
const { MockDataSource } = require('./mock-source');

function createDataSource(env) {
  if (env.MOCK === '1' || env.MOCK === 'true') {
    return { source: new MockDataSource(), kind: 'mock' };
  }
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY is not set. Copy .env.example to .env and fill it in, ' +
      'or run with MOCK=1 for local development.'
    );
  }
  return { source: new PlacesDataSource(apiKey), kind: 'places' };
}

module.exports = { createDataSource };
