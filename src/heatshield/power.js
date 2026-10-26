const POWER_API_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point";
const START_YEAR = "1981";
const END_YEAR = "2025";
const PARAMETERS = ["T2M", "RH2M", "PRECTOTCORR", "WS2M", "GWETROOT"];
const REQUEST_TIMEOUT_MS = 15000;

async function fetchAnnualClimate({ latitude, longitude, fetchImpl = globalThis.fetch }) {
  const url = new URL(POWER_API_URL);
  url.searchParams.set("parameters", PARAMETERS.join(","));
  url.searchParams.set("community", "RE");
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("start", START_YEAR);
  url.searchParams.set("end", END_YEAR);
  url.searchParams.set("format", "JSON");

  let response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw createPowerError(`NASA POWER request failed: ${error.message}`);
  }

  if (!response.ok) {
    throw createPowerError(`NASA POWER returned HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw createPowerError(`NASA POWER returned invalid JSON: ${error.message}`);
  }

  const parameters = payload?.properties?.parameter;
  if (!parameters || typeof parameters !== "object") {
    throw createPowerError("NASA POWER response did not contain climate parameters.");
  }

  for (const parameter of PARAMETERS) {
    if (!parameters[parameter] || typeof parameters[parameter] !== "object") {
      throw createPowerError(`NASA POWER response did not contain ${parameter} data.`);
    }
  }

  return aggregateAnnualClimate(parameters);
}

function createPowerError(message) {
  const error = new Error(message);
  error.status = 502;
  error.publicMessage = "NASA POWER climate data is temporarily unavailable.";
  return error;
}

function aggregateAnnualClimate(parameters) {
  const buckets = new Map();
  for (const [parameter, monthlyValues] of Object.entries(parameters)) {
    if (!PARAMETERS.includes(parameter) || !monthlyValues || typeof monthlyValues !== "object") {
      continue;
    }

    for (const [monthKey, rawValue] of Object.entries(monthlyValues)) {
      const match = /^(\d{4})(\d{2})$/.exec(monthKey);
      if (!match) {
        continue;
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (
        year < 1981 ||
        year > 2025 ||
        month < 1 ||
        month > 12 ||
        !Number.isFinite(value) ||
        value === -999
      ) {
        continue;
      }

      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const bucket = buckets.get(year) || createYearBucket();
      addDailyValue(bucket, parameter, value, days);
      if (parameter === "T2M" && Number.isFinite(parameters.RH2M?.[monthKey])) {
        const humidity = parameters.RH2M[monthKey];
        const heatIndex = calculateHeatIndexC(value, humidity);
        if (heatIndex !== null) {
          bucket.heatIndexC.weightedSum += heatIndex * days;
          bucket.heatIndexC.validDays += days;
          bucket.heatIndexC.validMonths += 1;
        }
      }
      buckets.set(year, bucket);
    }
  }

  return [...buckets.entries()]
    .sort(([firstYear], [secondYear]) => firstYear - secondYear)
    .map(([year, bucket]) => ({
      year,
      temperatureC: average(bucket.temperatureC),
      humidityPercent: average(bucket.humidityPercent),
      precipitationMmPerYear: round(bucket.precipitationMmPerDay.total, 1),
      windSpeedMs: average(bucket.windSpeedMs),
      rootZoneWetness: average(bucket.rootZoneWetness),
      heatIndexC: average(bucket.heatIndexC),
      validMonths: {
        temperature: bucket.temperatureC.validMonths,
        humidity: bucket.humidityPercent.validMonths,
        precipitation: bucket.precipitationMmPerDay.validMonths,
        wind: bucket.windSpeedMs.validMonths,
        soilMoisture: bucket.rootZoneWetness.validMonths,
        heatIndex: bucket.heatIndexC.validMonths,
      },
    }));
}

function createYearBucket() {
  return {
    temperatureC: createAverageBucket(),
    humidityPercent: createAverageBucket(),
    precipitationMmPerDay: { total: 0, validMonths: 0 },
    windSpeedMs: createAverageBucket(),
    rootZoneWetness: createAverageBucket(),
    heatIndexC: createAverageBucket(),
  };
}

function createAverageBucket() {
  return { weightedSum: 0, validDays: 0, validMonths: 0 };
}

function addDailyValue(bucket, parameter, value, days) {
  const averageBuckets = {
    T2M: bucket.temperatureC,
    RH2M: bucket.humidityPercent,
    WS2M: bucket.windSpeedMs,
    GWETROOT: bucket.rootZoneWetness,
  };
  if (parameter === "PRECTOTCORR") {
    bucket.precipitationMmPerDay.total += value * days;
    bucket.precipitationMmPerDay.validMonths += 1;
    return;
  }
  const target = averageBuckets[parameter];
  if (target) {
    target.weightedSum += value * days;
    target.validDays += days;
    target.validMonths += 1;
  }
}

function calculateHeatIndexC(temperatureC, humidityPercent) {
  const temperatureF = temperatureC * 9 / 5 + 32;
  if (temperatureF < 80 || humidityPercent < 40) {
    return null;
  }

  const t2 = temperatureF ** 2;
  const r2 = humidityPercent ** 2;
  let heatIndexF =
    -42.379 +
    2.04901523 * temperatureF +
    10.14333127 * humidityPercent -
    0.22475541 * temperatureF * humidityPercent -
    0.00683783 * t2 -
    0.05481717 * r2 +
    0.00122874 * t2 * humidityPercent +
    0.00085282 * temperatureF * r2 -
    0.00000199 * t2 * r2;

  if (humidityPercent < 13 && temperatureF >= 80 && temperatureF <= 112) {
    heatIndexF -=
      ((13 - humidityPercent) / 4) *
      Math.sqrt((17 - Math.abs(temperatureF - 95)) / 17);
  } else if (humidityPercent > 85 && temperatureF >= 80 && temperatureF <= 87) {
    heatIndexF +=
      ((humidityPercent - 85) / 10) *
      ((87 - temperatureF) / 5);
  }

  return (heatIndexF - 32) * 5 / 9;
}

function average(bucket) {
  return bucket.validDays ? round(bucket.weightedSum / bucket.validDays, 2) : null;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

module.exports = { aggregateAnnualClimate, calculateHeatIndexC, fetchAnnualClimate };
