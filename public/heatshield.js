const form = document.querySelector("#heatshield-form");
const statusBox = document.querySelector("#status-box");
const baselineAverage = document.querySelector("#baseline-average");
const baselinePeriod = document.querySelector("#baseline-period");
const recentAverage = document.querySelector("#recent-average");
const recentPeriod = document.querySelector("#recent-period");
const warmingDelta = document.querySelector("#warming-delta");
const stressTier = document.querySelector("#stress-tier");
const stressScore = document.querySelector("#stress-score");
const materialName = document.querySelector("#material-name");
const materialSummary = document.querySelector("#material-summary");
const materialMaterials = document.querySelector("#material-materials");
const energySavings = document.querySelector("#energy-savings");
const implementationDifficulty = document.querySelector("#implementation-difficulty");
const projectionGrid = document.querySelector("#projection-grid");
const countryLabel = document.querySelector("#country-label");
const outlookRows = document.querySelector("#outlook-rows");
const useLocationButton = document.querySelector("#use-location");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const latitude = document.querySelector("#latitude").value;
  const longitude = document.querySelector("#longitude").value;
  if (!latitude || !longitude) {
    setStatus("Enter both latitude and longitude.", true);
    return;
  }

  setStatus("Running climate analysis…", false);

  try {
    const params = new URLSearchParams({ latitude, longitude });
    const response = await fetch(`/api/heatshield/analyze?${params}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "HeatShield analysis failed.");
    }
    renderAnalysis(payload);
  } catch (error) {
    setStatus(error.message || "Unable to calculate the climate risk model.", true);
  }
});

useLocationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Location detection is not available in this browser.", true);
    return;
  }
  setStatus("Requesting your location…", false);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      document.querySelector("#latitude").value = coords.latitude.toFixed(4);
      document.querySelector("#longitude").value = coords.longitude.toFixed(4);
      form.requestSubmit();
    },
    (error) => setStatus(`Could not determine location: ${error.message}`, true),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
});

function renderAnalysis(data) {
  const { climateMetrics, thermalStress, projections, annualClimate, location } = data;

  baselineAverage.textContent = `${climateMetrics.baseline.averageC.toFixed(2)} °C`;
  baselinePeriod.textContent = climateMetrics.baseline.period;
  recentAverage.textContent = `${climateMetrics.recent.averageC.toFixed(2)} °C`;
  recentPeriod.textContent = climateMetrics.recent.period;
  warmingDelta.textContent = climateMetrics.warmingDeltaFormatted;

  stressTier.textContent = thermalStress.tier;
  stressScore.textContent = `${thermalStress.score}`;

  const prescription = thermalStress.prescription;
  materialName.textContent = prescription.materials[0];
  materialSummary.textContent = createPrescriptionText(thermalStress.tier, prescription.materials);
  materialMaterials.replaceChildren(...prescription.materials.map((item) => {
    const chip = document.createElement("span");
    chip.textContent = item;
    return chip;
  }));
  energySavings.textContent = `${prescription.estimatedEnergySavingsPercent.min}–${prescription.estimatedEnergySavingsPercent.max}%`;
  implementationDifficulty.textContent = prescription.implementationDifficulty;

  const country = location.country;
  countryLabel.textContent = country.status === "resolved"
    ? `${country.name}${country.countryCode ? ` (${country.countryCode})` : ""} · site-level analysis`
    : `${country.message || "Country could not be identified."} · site-level analysis`;
  renderRecentIndicators(annualClimate);
  setStatus("Analysis complete. Review the warming trends and prescribed materials below.", false);
  renderProjections(projections.scenarios, projections.outlook);
  renderOutlook(projections.outlook);
}

function renderRecentIndicators(annualClimate) {
  const recent = annualClimate.filter((item) => item.year >= 2015 && item.year <= 2025);
  const averageOf = (key) => {
    const values = recent.map((item) => item[key]).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };

  document.querySelector("#humidity-value").textContent = formatMetric(averageOf("humidityPercent"), "%");
  document.querySelector("#precipitation-value").textContent =
    formatMetric(averageOf("precipitationMmPerYear"), " mm");
  document.querySelector("#wind-value").textContent = formatMetric(averageOf("windSpeedMs"), " m/s");
  const soilWetness = averageOf("rootZoneWetness");
  document.querySelector("#soil-value").textContent =
    formatMetric(soilWetness === null ? null : soilWetness * 100, "%");
  document.querySelector("#heat-index-value").textContent =
    formatMetric(averageOf("heatIndexC"), " °C");
}

function renderProjections(scenarios, outlook) {
  projectionGrid.replaceChildren();
  Object.entries(scenarios).forEach(([key, scenario]) => {
    const card = document.createElement("article");
    card.className = "projection-card";

    const heading = document.createElement("p");
    heading.className = "eyebrow section-eyebrow";
    heading.textContent = key.toUpperCase();

    const title = document.createElement("h3");
    title.textContent = scenario.name;

    const list = document.createElement("ul");
    list.className = "pathway-list";
    outlook.forEach((horizon) => {
      const point = horizon.scenarios[key];
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `+${horizon.yearsAhead} years · ${horizon.year}`;
      const value = document.createElement("strong");
      value.textContent = `${point.temperatureC.toFixed(2)} °C`;
      item.append(label, value);
      list.append(item);
    });

    card.append(heading, title, list);
    projectionGrid.append(card);
  });
}

function renderOutlook(outlook) {
  outlookRows.replaceChildren();
  outlook.forEach((horizon) => {
    const row = document.createElement("tr");
    const values = [
      `+${horizon.yearsAhead} years · ${horizon.year}`,
      formatMetric(horizon.scenarios.ssp245.temperatureC, " °C"),
      formatMetric(horizon.scenarios.ssp585.temperatureC, " °C"),
      formatMetric(horizon.indicators.humidityPercent.estimate, "%"),
      formatMetric(horizon.indicators.precipitationMmPerYear.estimate, " mm"),
      formatMetric(horizon.indicators.windSpeedMs.estimate, " m/s"),
      formatMetric(
        horizon.indicators.rootZoneWetness.estimate === null
          ? null
          : horizon.indicators.rootZoneWetness.estimate * 100,
        "%",
      ),
      formatMetric(horizon.indicators.heatIndexC.estimate, " °C"),
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    outlookRows.append(row);
  });
}

function formatMetric(value, unit) {
  return Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "Not available";
}

function createPrescriptionText(tier, materials) {
  const prefix = tier === "Critical / Extreme" ? "Extreme" : tier === "High" ? "High" : "Moderate";
  return `${prefix} thermal load detected. Recommended materials: ${materials.join(" + ")}.`;
}

function setStatus(message, isError) {
  statusBox.classList.toggle("is-error", isError);
  statusBox.querySelector("p").textContent = message;
}
