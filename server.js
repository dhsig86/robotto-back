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

// ==== DIAGNÓSTICO DE FONTE DO REGISTRY (não altera loader) ====
app.get("/api/registry/sources", async (_req, res) => {
  const dumpShape = (obj) => {
    if (!obj) return { type: typeof obj, keys: [], isArray: false };
    const isArray = Array.isArray(obj);
    const keys = isArray ? [] : Object.keys(obj).slice(0, 10);
    const sample = isArray ? obj.slice(0, 1) : null;
    return { type: typeof obj, isArray, keys, sample };
  };

  const out = { env: {}, sources: {} };
  out.env.REGISTRY_URL = process.env.REGISTRY_URL || null;
  out.env.FEATURES_URL = process.env.FEATURES_URL || null;
  out.env.REDFLAGS_URL = process.env.REDFLAGS_URL || null;

  async function fetchJSON(url) {
    if (!url) return { ok: false, status: null, data: null };
    try {
      const u = new URL(url);
      u.searchParams.set("_", String(Date.now()));
      const r = await fetch(u.toString(), { cache: "no-store" });
      const status = r.status;
      if (!r.ok) return { ok: false, status, data: null };
      const data = await r.json();
      return { ok: true, status, data };
    } catch (e) {
      return { ok: false, status: null, error: String(e) };
    }
  }

  const reg = await fetchJSON(process.env.REGISTRY_URL);
  const feat = await fetchJSON(process.env.FEATURES_URL);
  const redf = await fetchJSON(process.env.REDFLAGS_URL);

  out.sources.registry = { ok: reg.ok, status: reg.status, shape: dumpShape(reg.data) };
  out.sources.features = { ok: feat.ok, status: feat.status, shape: dumpShape(feat.data) };
  out.sources.redflags = { ok: redf.ok, status: redf.status, shape: dumpShape(redf.data) };

  res.json(out);
});

app.get("/api/registry/force-fallback", async (_req, res) => {
  function splitAliases(s) {
    const base = String(s || "").trim();
    const parts = base.split(/[;,|]/g).map((x) => x.trim()).filter(Boolean);
    const set = new Set(parts.length ? parts : [base]);
    return Array.from(set);
  }
  function coerceFeaturesMap(input) {
    if (!input) return {};
    if (!Array.isArray(input) && Array.isArray(input.features)) return coerceFeaturesMap(input.features);
    if (Array.isArray(input)) {
      const map = {};
      for (const it of input) {
        if (!it || !it.id) continue;
        const meta = { label: it.label || it.id };
        if (Array.isArray(it.aliases)) meta.aliases = it.aliases;
        else if (typeof it.aliases === "string") meta.aliases = splitAliases(it.aliases);
        map[it.id] = meta;
      }
      return map;
    }
    const keys = Object.keys(input);
    const looksLikeMap = keys.some((k) => /^[a-z0-9_.]+$/.test(k));
    if (!looksLikeMap) return {};
    return input;
  }

  const resp = { used: {}, counts: {}, samples: {} };

  async function fetchJSON(url) {
    if (!url) return null;
    const u = new URL(url);
    u.searchParams.set("_", String(Date.now()));
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  }

  const featRaw = await fetchJSON(process.env.FEATURES_URL);
  const rfRaw = await fetchJSON(process.env.REDFLAGS_URL);

  const featuresMap = coerceFeaturesMap(featRaw);
  const ids = Object.keys(featuresMap);
  const aliasesCount = ids.reduce((acc, id) => {
    const a = featuresMap[id]?.aliases;
    if (Array.isArray(a)) return acc + a.length;
    return acc;
  }, 0);

  resp.counts.features = ids.length;
  resp.counts.aliases = aliasesCount;
  resp.samples.features = ids.slice(0, 5).map((id) => ({ id, meta: featuresMap[id] }));

  res.json(resp);
});

// Boot
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[ROBOTTO] backend up on :${port} (env=${process.env.NODE_ENV || "production"})`);
  // warm registry
  getRegistry(true).catch(() => {});
});
