const REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;
const cache = new Map();
let nextRequestAt = 0;

async function reverseGeocode({ latitude, longitude, fetchImpl = globalThis.fetch }) {
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const now = Date.now();
  const scheduledAt = Math.max(now, nextRequestAt);
  nextRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS;
  const waitMs = scheduledAt - now;
  if (waitMs) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const url = new URL(REVERSE_URL);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "3");

  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "HeatShieldAI/1.0 (climate analysis application)" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Reverse geocoder returned HTTP ${response.status}.`);
    }
    const payload = await response.json();
    const country = payload.address?.country;
    if (!country) {
      throw new Error("Reverse geocoder did not return a country for these coordinates.");
    }

    const value = {
      name: country,
      countryCode: payload.address.country_code?.toUpperCase() || null,
      source: "OpenStreetMap Nominatim",
      status: "resolved",
    };
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.warn("Country lookup unavailable:", error.message);
    return {
      name: null,
      countryCode: null,
      source: "OpenStreetMap Nominatim",
      status: "unavailable",
      message: "Country lookup is temporarily unavailable.",
    };
  }
}

module.exports = { reverseGeocode };
