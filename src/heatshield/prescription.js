const PRESCRIPTIONS = {
  moderate: {
    level: 1,
    tier: "Moderate",
    materials: ["Cool Roof Elastomeric White Coatings"],
    estimatedEnergySavingsPercent: { min: 10, max: 20 },
    implementationDifficulty: "Low",
  },
  high: {
    level: 2,
    tier: "High",
    materials: ["Expanded Polystyrene (EPS) / XPS Rigid Foam Boards"],
    estimatedEnergySavingsPercent: { min: 15, max: 30 },
    implementationDifficulty: "Moderate",
  },
  critical: {
    level: 3,
    tier: "Critical / Extreme",
    materials: ["Phase Change Materials (PCMs)", "Green Roof Infrastructure"],
    estimatedEnergySavingsPercent: { min: 20, max: 40 },
    implementationDifficulty: "High",
  },
};

function calculateThermalStress(climateMetrics, projections) {
  const highScenario = projections.scenarios.ssp585.values;
  if (highScenario.length === 0) {
    throw new Error("Future projections are required to calculate thermal stress.");
  }

  const futureAnomalyC = Math.max(...highScenario.map(({ anomalyC }) => anomalyC));
  const historicalRisk = clamp(climateMetrics.warmingDeltaC / 3 * 100);
  const projectedRisk = clamp(futureAnomalyC / 6 * 100);
  const score = Math.round(historicalRisk * 0.4 + projectedRisk * 0.6);
  const tier = score < 35 ? "moderate" : score < 65 ? "high" : "critical";
  const prescription = PRESCRIPTIONS[tier];

  return {
    score,
    tier: prescription.tier,
    level: prescription.level,
    scoreComponents: {
      historicalWarmingRisk: Math.round(historicalRisk),
      projectedWarmingRisk: Math.round(projectedRisk),
      weights: { historical: 0.4, projected: 0.6 },
      normalization: {
        historicalWarmingDeltaCFor100: 3,
        projectedAnomalyCFor100: 6,
      },
    },
    tierThresholds: { moderate: "0-34", high: "35-64", critical: "65-100" },
    prescription: {
      ...prescription,
      estimatedEnergySavingsPercent: { ...prescription.estimatedEnergySavingsPercent },
      note: "Indicative ranges only; actual savings depend on the building, climate, and installation.",
    },
  };
}

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

module.exports = { calculateThermalStress };
