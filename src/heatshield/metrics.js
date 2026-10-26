const BASELINE_START = 1981;
const BASELINE_END = 1990;
const RECENT_START = 2015;
const RECENT_END = 2025;

function calculateClimateMetrics(annualTemperatures) {
  const baseline = averagePeriod(annualTemperatures, BASELINE_START, BASELINE_END);
  const recent = averagePeriod(annualTemperatures, RECENT_START, RECENT_END);

  if (baseline.yearCount === 0 || recent.yearCount === 0) {
    throw new Error("Temperature data must include observations in both comparison periods.");
  }

  const warmingDeltaC = round(recent.averageC - baseline.averageC, 2);
  return {
    baseline: {
      period: `${BASELINE_START}-${BASELINE_END}`,
      averageC: round(baseline.averageC, 2),
      yearsIncluded: baseline.yearCount,
    },
    recent: {
      period: `${RECENT_START}-${RECENT_END}`,
      averageC: round(recent.averageC, 2),
      yearsIncluded: recent.yearCount,
    },
    warmingDeltaC,
    warmingDeltaFormatted: `${warmingDeltaC >= 0 ? "+" : ""}${warmingDeltaC.toFixed(2)} °C`,
  };
}

function averagePeriod(annualTemperatures, startYear, endYear) {
  const values = annualTemperatures
    .filter(({ year, averageC, temperatureC }) => (
      year >= startYear &&
      year <= endYear &&
      Number.isFinite(averageC ?? temperatureC)
    ))
    .map(({ averageC, temperatureC }) => averageC ?? temperatureC);

  return {
    averageC: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN,
    yearCount: values.length,
  };
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

module.exports = { calculateClimateMetrics };
