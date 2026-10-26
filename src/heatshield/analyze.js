const { fetchAnnualClimate } = require("./power");
const { reverseGeocode } = require("./geocode");
const { calculateClimateMetrics } = require("./metrics");
const { projectTemperatures } = require("./projections");
const { calculateThermalStress } = require("./prescription");

async function analyzeLocation({
  latitude,
  longitude,
  fetchImpl,
  geocodeFetchImpl = globalThis.fetch,
}) {
  const [annualClimate, country] = await Promise.all([
    fetchAnnualClimate({ latitude, longitude, fetchImpl }),
    reverseGeocode({ latitude, longitude, fetchImpl: geocodeFetchImpl }),
  ]);
  if (annualClimate.length < 2) {
    throw new Error("NASA POWER returned fewer than two valid annual climate records.");
  }

  const climateMetrics = calculateClimateMetrics(annualClimate);
  const projections = projectTemperatures(annualClimate, climateMetrics);
  const thermalStress = calculateThermalStress(climateMetrics, projections);

  return {
    location: {
      latitude,
      longitude,
      country,
      geographicScope: "coordinate point; not a country-wide spatial average",
    },
    dataSource: {
      name: "NASA POWER",
      parameters: ["T2M", "RH2M", "PRECTOTCORR", "WS2M", "GWETROOT"],
      period: "1981-2025",
      aggregation:
        "Day-weighted monthly mean for temperature, humidity, wind, and soil wetness; precipitation daily rates summed by days per year",
      heatIndex:
        "Monthly Rothfusz heat index averaged over qualifying warm/humid months; unavailable below the standard heat-index threshold",
    },
    annualClimate,
    climateMetrics,
    projections,
    thermalStress,
  };
}

module.exports = { analyzeLocation };
