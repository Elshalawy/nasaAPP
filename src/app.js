const express = require("express");
const path = require("node:path");

const { analyzeLocation } = require("./heatshield/analyze");

function createApp({
  fetchImpl = globalThis.fetch,
  geocodeFetchImpl = globalThis.fetch,
} = {}) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", (_req, res) => {
    res.redirect(302, "/heatshield.html");
  });

  app.get("/api/heatshield/analyze", async (req, res) => {
    const latitude = parseCoordinate(req.query.latitude, -90, 90);
    const longitude = parseCoordinate(req.query.longitude, -180, 180);

    if (latitude === null || longitude === null) {
      return res.status(400).json({
        error: "Provide valid latitude (-90 to 90) and longitude (-180 to 180).",
      });
    }

    const analysis = await analyzeLocation({
      latitude,
      longitude,
      fetchImpl,
      geocodeFetchImpl,
    });
    res.json(analysis);
  });

  app.use((err, _req, res, _next) => {
    if (res.headersSent) {
      return;
    }

    const status = Number.isInteger(err.status) ? err.status : 502;
    if (status >= 500) {
      console.error("API request failed:", err.message);
    }
    res.status(status).json({
      error: status === 502
        ? err.publicMessage || "External data is temporarily unavailable."
        : err.message,
    });
  });

  app.use(express.static(path.join(__dirname, "..", "public")));

  return app;
}

function parseCoordinate(value, min, max) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

module.exports = createApp();
module.exports.createApp = createApp;
