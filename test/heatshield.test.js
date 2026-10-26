const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createServer } = require("node:http");
const { createApp } = require("../src/app");
const { aggregateAnnualClimate, calculateHeatIndexC, fetchAnnualClimate } =
  require("../src/heatshield/power");
const { calculateClimateMetrics } = require("../src/heatshield/metrics");
const { projectTemperatures } = require("../src/heatshield/projections");
const { calculateThermalStress } = require("../src/heatshield/prescription");

function createMonthlyData() {
  const parameters = {
    T2M: {},
    RH2M: {},
    PRECTOTCORR: {},
    WS2M: {},
    GWETROOT: {},
  };
  for (let year = 1981; year <= 2025; year += 1) {
    const temperature = 10 + (year - 1981) * 0.02;
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}${String(month).padStart(2, "0")}`;
      parameters.T2M[key] = temperature;
      parameters.RH2M[key] = 50 + (year - 1981) * 0.1;
      parameters.PRECTOTCORR[key] = 1;
      parameters.WS2M[key] = 3;
      parameters.GWETROOT[key] = 0.5;
    }
  }
  parameters.T2M["198101"] = -999;
  parameters.RH2M["198101"] = -999;
  return parameters;
}

const monthlyData = createMonthlyData();

test("monthly NASA POWER values are filtered and aggregated with correct units", () => {
  const annual = aggregateAnnualClimate({
    T2M: { 202401: 10, 202402: 20, 202403: -999, 202413: 100 },
    RH2M: { 202401: 50, 202402: 70, 202403: -999 },
    PRECTOTCORR: { 202401: 1, 202402: 2, 202403: -999 },
    WS2M: { 202401: 3, 202402: 5 },
    GWETROOT: { 202401: 0.2, 202402: 0.8 },
  });

  assert.equal(annual.length, 1);
  assert.deepEqual(annual[0], {
    year: 2024,
    temperatureC: 14.83,
    humidityPercent: 59.67,
    precipitationMmPerYear: 89,
    windSpeedMs: 3.97,
    rootZoneWetness: 0.49,
    heatIndexC: null,
    validMonths: {
      temperature: 2,
      humidity: 2,
      precipitation: 2,
      wind: 2,
      soilMoisture: 2,
      heatIndex: 0,
    },
  });
});

test("heat index is omitted below its use threshold", () => {
  assert.equal(calculateHeatIndexC(20, 75), null);
  assert.ok(calculateHeatIndexC(35, 70) > 35);
});

test("NASA POWER ingestion requests all climate variables and required years", async () => {
  let requestedUrl;
  const annual = await fetchAnnualClimate({
    latitude: 37.5,
    longitude: -122.25,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ properties: { parameter: monthlyData } }) };
    },
  });

  assert.equal(requestedUrl.searchParams.get("parameters"), "T2M,RH2M,PRECTOTCORR,WS2M,GWETROOT");
  assert.equal(requestedUrl.searchParams.get("start"), "1981");
  assert.equal(requestedUrl.searchParams.get("end"), "2025");
  assert.equal(requestedUrl.searchParams.get("latitude"), "37.5");
  assert.equal(requestedUrl.searchParams.get("longitude"), "-122.25");
  assert.equal(annual.length, 45);
  assert.equal(annual[0].validMonths.temperature, 11);
  assert.equal(annual[0].temperatureC, 10);
  assert.equal(annual[0].precipitationMmPerYear, 365);
});

test("climate metrics average the requested baseline and recent periods", () => {
  const metrics = calculateClimateMetrics(aggregateAnnualClimate(monthlyData));

  assert.equal(metrics.baseline.period, "1981-1990");
  assert.equal(metrics.baseline.yearsIncluded, 10);
  assert.equal(metrics.recent.period, "2015-2025");
  assert.equal(metrics.recent.yearsIncluded, 11);
  assert.equal(metrics.warmingDeltaFormatted, "+0.69 °C");
});

test("projections include 2-, 5-, 20-year outlooks and both pathways through 2100", () => {
  const annual = aggregateAnnualClimate(monthlyData);
  const metrics = calculateClimateMetrics(annual);
  const projections = projectTemperatures(annual, metrics);
  const moderate = projections.scenarios.ssp245.values;
  const high = projections.scenarios.ssp585.values;

  assert.equal(moderate.length, 75);
  assert.equal(moderate[0].year, 2026);
  assert.equal(moderate.at(-1).year, 2100);
  assert.ok(high.at(-1).temperatureC > moderate.at(-1).temperatureC);
  assert.deepEqual(projections.outlook.map((item) => [item.yearsAhead, item.year]), [
    [2, 2027],
    [5, 2030],
    [20, 2045],
  ]);
  assert.equal(projections.outlook[0].indicators.humidityPercent.unit, "%");
  assert.equal(projections.outlook[0].indicators.precipitationMmPerYear.unit, "mm/year");
  assert.match(projections.methodology.description, /not official IPCC/);
  assert.match(projections.methodology.outlookDescription, /not scenario-based climate-model forecasts/);
});

test("thermal stress maps score tiers to the requested materials", () => {
  const projection = (anomalyC) => ({
    scenarios: { ssp585: { values: [{ year: 2100, anomalyC }] } },
  });
  const metrics = (warmingDeltaC) => ({ warmingDeltaC });

  assert.equal(calculateThermalStress(metrics(0.1), projection(0.5)).level, 1);
  assert.equal(calculateThermalStress(metrics(2), projection(2)).level, 2);
  const critical = calculateThermalStress(metrics(3), projection(5));
  assert.equal(critical.score, 90);
  assert.equal(critical.level, 3);
  assert.deepEqual(critical.prescription.materials, [
    "Phase Change Materials (PCMs)",
    "Green Roof Infrastructure",
  ]);
  assert.ok(critical.prescription.estimatedEnergySavingsPercent.max <= 100);
});

let server;
let baseUrl;
let nasaPowerRequested = false;

before(async () => {
  const app = createApp({
    fetchImpl: async (url) => {
      nasaPowerRequested = true;
      const requestUrl = new URL(url);
      assert.equal(requestUrl.hostname, "power.larc.nasa.gov");
      return {
        ok: true,
        json: async () => ({ properties: { parameter: monthlyData } }),
      };
    },
    geocodeFetchImpl: async () => ({
      ok: true,
      json: async () => ({
        address: { country: "United States", country_code: "us" },
      }),
    }),
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("analysis endpoint returns climate indicators, forecasts, country, and prescriptions", async () => {
  const response = await fetch(
    `${baseUrl}/api/heatshield/analyze?latitude=37.5&longitude=-122.25`,
  );
  assert.equal(response.status, 200);
  const analysis = await response.json();

  assert.equal(analysis.location.country.name, "United States");
  assert.equal(analysis.location.country.countryCode, "US");
  assert.match(analysis.location.geographicScope, /not a country-wide/);
  assert.ok(analysis.dataSource.parameters.includes("RH2M"));
  assert.equal(analysis.annualClimate.length, 45);
  assert.equal(analysis.projections.outlook[2].year, 2045);
  assert.equal(analysis.projections.scenarios.ssp585.values.at(-1).year, 2100);
  assert.ok(analysis.thermalStress.score >= 0 && analysis.thermalStress.score <= 100);
  assert.ok(analysis.thermalStress.prescription.materials.length > 0);
  assert.equal(nasaPowerRequested, true);
});

test("analysis endpoint rejects missing or out-of-range coordinates", async () => {
  nasaPowerRequested = false;
  const response = await fetch(`${baseUrl}/api/heatshield/analyze?latitude=91&longitude=0`);
  assert.equal(response.status, 400);
  assert.equal(nasaPowerRequested, false);
});

test("heatshield dashboard page is served", async () => {
  const response = await fetch(`${baseUrl}/heatshield.html`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /HeatShield AI/);
});

test("home page opens HeatShield and the image library endpoint is removed", async () => {
  const homeResponse = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(homeResponse.status, 302);
  assert.equal(homeResponse.headers.get("location"), "/heatshield.html");

  const imageResponse = await fetch(`${baseUrl}/api/nasa/images?q=mars`);
  assert.equal(imageResponse.status, 404);
});
