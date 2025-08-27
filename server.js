// ROBOTTO backend — Node 20+, ESM
import express from "express";
import cors from "cors";
import { loadConfig } from "./src/config.js";
import { getRegistry } from "./src/registryLoader.js";
import triageRouter from "./src/routes/triage.js";

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
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "robotto-backend",
    registryLoaded: !!getRegistry()?.featuresSet?.size
  });
});

// API
app.use("/api/triage", triageRouter);

// Boot
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[ROBOTTO] backend up on :${port} (env=${process.env.NODE_ENV || "production"})`);
  // warm registry load (async)
  getRegistry(true).catch(() => {});
});
