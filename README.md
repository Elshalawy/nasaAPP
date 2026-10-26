# HeatShield AI

Climate analysis dashboard and API using NASA POWER historical data.

## Run

```sh
npm install
npm start
```

Set `PORT` to use a different port. The app listens on port `3000` by default.
Open `http://localhost:3000` to use the HeatShield dashboard.

## Endpoints

- `GET /api/health` — service health check.
- `GET /api/heatshield/analyze?latitude=37.5&longitude=-122.25` — retrieve
  NASA POWER monthly temperature, relative humidity, precipitation, wind, and
  root-zone soil-wetness data aggregated by year, automatically resolve the
  country from the coordinates, and return baseline vs. recent climate metrics,
  a heat-index estimate, 2/5/20-year outlooks, illustrative pathways through
  2100, and a thermal-stress score with a material prescription. Latitude must
  be from -90 to 90; longitude must be from -180 to 180.

HeatShield analysis uses NASA POWER's public API. Projection multipliers and
thermal-stress thresholds are simplified illustrative assumptions, not official
IPCC projections, a building energy audit, or a guarantee of material savings.
The 2015–2025 recent average includes eleven calendar years.
Annual means are weighted by the number of days in each valid month; NASA
POWER's annual summary values are excluded from the monthly aggregation. The
projection applies a linear trend fitted to the local 1981–2025 annual series,
with multipliers of 1.0 for SSP2-4.5 and 1.8 for SSP5-8.5. The 0–100 score
weights historical warming at 40% (3 °C scales to 100) and the high-emission
2100 anomaly at 60% (6 °C scales to 100); scores below 35 are Moderate, 35–64
High, and 65 or higher Critical. Indicative energy-savings ranges are 10–20%,
15–30%, and 20–40% for Levels 1–3 respectively; actual outcomes require a
building-specific assessment.
Humidity, wind, and soil wetness are day-weighted averages; monthly corrected
precipitation rates are summed into annual totals. Heat index uses the
Rothfusz formula only for qualifying warm and humid months, so it may be
unavailable at cooler locations. The short- and long-range non-temperature
outlooks extend local historical trends and are not seasonal weather forecasts
or scenario-specific climate-model results. Country identification uses
OpenStreetMap Nominatim reverse geocoding; climate indicators are for the
selected coordinate, not a spatial average over the whole country.

## Tests

```sh
npm test
```
