// ROBOTTO backend — Node 20+, ESM
import express from "express";
import cors from "cors";
import { loadConfig } from "./src/config.js";
import { getRegistry } from "./src/registryLoader.js";
import triageRouter from "./src/routes/triage.js";
import debugRouter from "./src/routes/debug.js";
import { metrics } from "./src/metrics.js";

const cfg = loadConfig();
const app = express();

// CORS
app.use(
  cors({
    origin: cfg.ALLOW_ORIGINS.length ? cfg.ALLOW_ORIGINS : true,
    credentials: false
  })
);

app.use(express.json({ limit: "1mb" }));

// Healthcheck
app.get("/", async (_req, res) => {
  const reg = await getRegistry();
  res.json({
    ok: true,
    name: "robotto-backend",
    registryLoaded: !!reg?.featuresSet?.size,
    metrics
  });
});

// API
app.use("/api/triage", triageRouter);
app.use("/api/registry", debugRouter);

// Métricas simples
app.get("/api/metrics", (_req, res) => {
  res.json(metrics);
});

// Boot
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[ROBOTTO] backend up on :${port} (env=${process.env.NODE_ENV || "production"})`);
  // warm registry
  getRegistry(true).catch(() => {});
});
