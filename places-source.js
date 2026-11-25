'use strict';

/**
 * PlacesDataSource — Google Places API (New) implementation of the
 * DataSource interface (see data-source.js).
 *
 * The fetch + normalize logic is ported directly from the bespoke Wix Velo
 * backend that runs in production on the owner's own sites
 * (~/workspace/true-north-reviews-widget/http-functions.js): one Place
 * Details call with a field mask of displayName, rating, userRatingCount,
 * googleMapsUri, reviews; reviews normalized and sorted newest first.
 *
 * Known v1 limitation: the Places API returns at most 5 reviews per place,
 * with no pagination. The rating and count are always the true live totals.
 *
 * The API key comes from the constructor (server.js passes the
 * GOOGLE_PLACES_API_KEY environment variable). It is never hardcoded and
 * never sent to the browser.
 */

class PlacesDataSource {
  constructor(apiKey) {
    if (!apiKey) throw new Error('PlacesDataSource requires an API key.');
    this.apiKey = apiKey;
  }

  async getPlaceReviews(placeId) {
    const url = 'https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews'
      }
    });
    if (!res.ok) {
      throw new Error('Google Places API answered ' + res.status);
    }
    const data = await res.json();
    return normalizePlaceDetails(data);
  }

  /**
   * Place lookup for the app settings screen: the customer types their
   * business name, picks the right result, and we store the placeId.
   * Uses Places Text Search (New).
   */
  async searchPlaces(query) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
      },
      body: JSON.stringify({ textQuery: query, pageSize: 5 })
    });
    if (!res.ok) {
      throw new Error('Google Places search answered ' + res.status);
    }
    const data = await res.json();
    return (data.places || []).map((p) => ({
      placeId: p.id,
      name: (p.displayName && p.displayName.text) || '',
      address: p.formattedAddress || ''
    }));
  }
}

function normalizePlaceDetails(data) {
  const reviews = (data.reviews || []).map((r) => ({
    author: (r.authorAttribution && r.authorAttribution.displayName) || 'Google guest',
    photo: (r.authorAttribution && r.authorAttribution.photoUri) || '',
    rating: r.rating || 5,
    text: (r.text && r.text.text) || '',
    publishTime: r.publishTime || '',
    relativeTime: r.relativePublishTimeDescription || ''
  }));
  // Newest first.
  reviews.sort((a, b) => String(b.publishTime).localeCompare(String(a.publishTime)));

  return {
    name: (data.displayName && data.displayName.text) || '',
    rating: data.rating || 5.0,
    count: data.userRatingCount || 0,
    googleMapsUri: data.googleMapsUri || '',
    reviews: reviews,
    fetchedAt: new Date().toISOString()
  };
}

module.exports = { PlacesDataSource, normalizePlaceDetails };
