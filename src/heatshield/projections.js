const PROJECTION_END_YEAR = 2100;
const SCENARIOS = [
  { id: "ssp245", name: "SSP2-4.5 (Moderate)", multiplier: 1 },
  { id: "ssp585", name: "SSP5-8.5 (High Emission)", multiplier: 1.8 },
];
const OUTLOOK_HORIZONS = [2, 5, 20];
const INDICATORS = [
  { key: "humidityPercent", unit: "%", min: 0, max: 100 },
  { key: "precipitationMmPerYear", unit: "mm/year", min: 0 },
  { key: "windSpeedMs", unit: "m/s", min: 0 },
  { key: "rootZoneWetness", unit: "fraction", min: 0, max: 1 },
  { key: "heatIndexC", unit: "°C", min: -100 },
];

function projectTemperatures(annualTemperatures, climateMetrics) {
  const trendCPerYear = calculateLinearTrend(annualTemperatures, "temperatureC");
  const lastObservedYear = Math.max(...annualTemperatures.map(({ year }) => year));
  const recentAverageC = climateMetrics.recent.averageC;
  const baselineAverageC = climateMetrics.baseline.averageC;

  return {
    methodology: {
      description:
        "Illustrative linear local-trend scenarios; multipliers are simplified assumptions, not official IPCC model outputs.",
      scenarioMultipliers: { ssp245: 1, ssp585: 1.8 },
      historicalTrendCPerYear: round(trendCPerYear, 4),
      anchorYear: lastObservedYear,
      anchorTemperatureC: round(recentAverageC, 2),
      anomalyReferenceC: round(baselineAverageC, 2),
      outlookDescription:
        "2-, 5-, and 20-year environment indicators extend each site's historical trend. Non-temperature indicators are linear trend extrapolations, not scenario-based climate-model forecasts.",
    },
    scenarios: Object.fromEntries(
      SCENARIOS.map(({ id, name, multiplier }) => [
        id,
        {
          name,
          multiplier,
          values: Array.from(
            { length: Math.max(0, PROJECTION_END_YEAR - lastObservedYear) },
            (_, index) => {
              const year = lastObservedYear + index + 1;
              const temperatureC =
                recentAverageC + trendCPerYear * (year - lastObservedYear) * multiplier;
              return {
                year,
                temperatureC: round(temperatureC, 2),
                anomalyC: round(temperatureC - baselineAverageC, 2),
              };
            },
          ),
        },
      ]),
    ),
    outlook: createEnvironmentOutlook(
      annualTemperatures,
      climateMetrics,
      trendCPerYear,
      lastObservedYear,
    ),
  };
}

function createEnvironmentOutlook(
  annualTemperatures,
  climateMetrics,
  temperatureTrendCPerYear,
  anchorYear,
) {
  return OUTLOOK_HORIZONS.map((yearsAhead) => {
    const year = anchorYear + yearsAhead;
    const indicators = Object.fromEntries(
      INDICATORS.map(({ key, unit, min, max }) => {
        const observations = annualTemperatures.filter(({ [key]: value }) => Number.isFinite(value));
        if (!observations.length) {
          return [key, { estimate: null, unit, historicalTrendPerYear: null }];
        }

        const trend = observations.length >= 2 ? calculateLinearTrend(observations, key) : null;
        const lastObservation = observations.reduce(
          (latest, item) => item.year > latest.year ? item : latest,
        );
        const rawEstimate = trend === null
          ? lastObservation[key]
          : lastObservation[key] + trend * yearsAhead;
        const estimate = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rawEstimate));
        return [key, {
          estimate: round(estimate, 2),
          unit,
          historicalTrendPerYear: trend === null ? null : round(trend, 4),
          method: trend === null ? "latest observed value" : "linear historical trend",
        }];
      }),
    );

    const scenarios = Object.fromEntries(
      SCENARIOS.map(({ id, multiplier }) => {
        const temperatureC =
          climateMetrics.recent.averageC + temperatureTrendCPerYear * yearsAhead * multiplier;
        return [id, {
          temperatureC: round(temperatureC, 2),
          anomalyC: round(temperatureC - climateMetrics.baseline.averageC, 2),
        }];
      }),
    );

    return { yearsAhead, year, scenarios, indicators };
  });
}

function calculateLinearTrend(annualTemperatures, valueKey = "averageC") {
  const observations = annualTemperatures.filter((item) => (
    Number.isFinite(item.year) && Number.isFinite(item[valueKey])
  ));
  if (observations.length < 2) {
    throw new Error("At least two valid annual temperatures are required for projections.");
  }

  const meanYear = observations.reduce((sum, item) => sum + item.year, 0) / observations.length;
  const meanTemperature =
    observations.reduce((sum, item) => sum + item[valueKey], 0) / observations.length;
  const numerator = observations.reduce(
    (sum, item) => sum + (item.year - meanYear) * (item[valueKey] - meanTemperature),
    0,
  );
  const denominator = observations.reduce(
    (sum, item) => sum + (item.year - meanYear) ** 2,
    0,
  );

  if (denominator === 0) {
    throw new Error("Annual temperature data must span at least two distinct years.");
  }
  return numerator / denominator;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

module.exports = { calculateLinearTrend, projectTemperatures };
