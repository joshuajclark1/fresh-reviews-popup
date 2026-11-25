'use strict';

/**
 * MockDataSource — serves the sample fixture (sample-data.json) so the
 * whole stack runs locally with no Google API key and no network calls.
 * Enabled with MOCK=1 (see data-source.js).
 */

const sample = require('./sample-data.json');

class MockDataSource {
  async getPlaceReviews(placeId) {
    // Deep copy so callers/cache can never mutate the fixture, and stamp a
    // fresh fetchedAt so cache behavior is visible in responses.
    const payload = JSON.parse(JSON.stringify(sample));
    delete payload._comment;
    payload.fetchedAt = new Date().toISOString();
    return payload;
  }

  async searchPlaces(query) {
    return [{
      placeId: 'sample-place-id',
      name: sample.name,
      address: '7 E Dock Rd, Bayfield, WI 54814, USA'
    }];
  }
}

module.exports = { MockDataSource };
