// ROBOTTO backend — registry loader com fallbacks e logging
import { loadConfig } from "./config.js";
import { normalizeStr } from "./utils/text.js";

let _cache = null;
let _ts = 0;

/**
 * Carrega o registry (snapshot + fallbacks) e indexa:
 *  - featuresSet: Set<string> de featureIds
 *  - idToMeta: { [featureId]: meta }
 *  - aliasToId: Map<aliasNormalizado, featureId>
 *  - featuresMap/redflags/byGlobalId para consumidores que precisem
 */
export async function getRegistry(warm = false) {
  const fresh = Date.now() - _ts < 10 * 60 * 1000;
  if (_cache && fresh && !warm) return _cache;

  const cfg = loadConfig();
  const out = { raw: {}, featuresSet: new Set(), idToMeta: {}, aliasToId: new Map() };

  // 1) tenta snapshot (REGISTRY_URL)
  let snap = null;
  if (cfg.REGISTRY_URL) {
    try {
      const res = await fetch(withBust(cfg.REGISTRY_URL), { cache: "no-store" });
      if (!res.ok) throw new Error(`registry fetch ${res.status}`);
      snap = await res.json();
      out.raw.snapshot_ok = true;
    } catch (e) {
      console.error("[registryLoader] REGISTRY_URL error:", e.message);
      out.raw.snapshot_ok = false;
    }
  }

  // 2) extrai possíveis formatos do snapshot
  let { featuresMap, redflagsMap, byGlobalId } = extractFromSnapshot(snap);

  // 3) fallbacks diretos se vazio
  if (!featuresMap || !Object.keys(featuresMap).length) {
    if (cfg.FEATURES_URL) {
      try {
        const r = await fetch(withBust(cfg.FEATURES_URL), { cache: "no-store" });
        if (r.ok) {
          featuresMap = await r.json();
          out.raw.features_fallback = true;
        }
      } catch (e) {
        console.error("[registryLoader] FEATURES_URL error:", e.message);
      }
    }
  }
  if (!redflagsMap || !Object.keys(redflagsMap).length) {
    if (cfg.REDFLAGS_URL) {
      try {
        const r = await fetch(withBust(cfg.REDFLAGS_URL), { cache: "no-store" });
        if (r.ok) {
          redflagsMap = await r.json();
          out.raw.redflags_fallback = true;
        }
      } catch (e) {
        console.error("[registryLoader] REDFLAGS_URL error:", e.message);
      }
    }
  }

  // 4) indexação
  const featuresSet = new Set();
  const idToMeta = {};
  const aliasToId = new Map();

  for (const [fid, metaRaw] of Object.entries(featuresMap || {})) {
    const meta = metaRaw || {};
    featuresSet.add(fid);
    idToMeta[fid] = meta;

    const rawAliases = new Set();

    if (Array.isArray(meta.aliases)) meta.aliases.forEach((x) => rawAliases.add(x));
    if (meta.label) {
      rawAliases.add(meta.label);
      explodeLabel(meta.label).forEach((x) => rawAliases.add(x));
    }
    rawAliases.add(fid);
    rawAliases.add(fid.replaceAll("_", " "));
    rawAliases.add(fid.replaceAll(".", " "));

    for (const raw of rawAliases) {
      const key = normalizeStr(raw);
      if (key) aliasToId.set(key, fid);
    }
  }

  out.featuresSet = featuresSet;
  out.idToMeta = idToMeta;
  out.aliasToId = aliasToId;

  // objetos auxiliares para quem usa
  out.featuresMap = featuresMap || {};
  out.redflags = normalizeRedflags(redflagsMap || {});
  out.byGlobalId = byGlobalId || {};

  _cache = out;
  _ts = Date.now();

  // log útil no Heroku para confirmar carregamento
  console.log(
    "[registryLoader] loaded",
    "features:", out.featuresSet.size,
    "aliases:", out.aliasToId.size,
    "snapshot_ok:", !!out.raw.snapshot_ok,
    "fallbackF:", !!out.raw.features_fallback,
    "fallbackR:", !!out.raw.redflags_fallback
  );

  return _cache;
}

export function allowedFeaturesFrom(bodyMap, reg) {
  const fromClient = Array.isArray(bodyMap) ? bodyMap : [];
  const byClient = new Set(fromClient);
  if (byClient.size) return byClient;
  return reg?.featuresSet || new Set();
}

/* ===== helpers ===== */

function extractFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return { featuresMap: {}, redflagsMap: {}, byGlobalId: {} };

  const featuresMap =
    snap.featuresMap ||
    snap.features ||
    snap.byFeatureId ||
    snap.registry?.featuresMap ||
    snap.registry?.features ||
    snap.global?.featuresMap ||
    {};

  let redflagsMap =
    snap.redflagsByFeatureId ||
    snap.redflags_map ||
    snap.redflags ||
    snap.registry?.redflags ||
    snap.global?.redflags ||
    {};

  const byGlobalId =
    snap.byGlobalId ||
    snap.globalById ||
    snap.registry?.byGlobalId ||
    {};

  return { featuresMap, redflagsMap, byGlobalId };
}

function normalizeRedflags(rf) {
  if (Array.isArray(rf)) {
    const m = {};
    for (const k of rf) m[k] = true;
    return m;
  }
  return rf || {};
}

function explodeLabel(label) {
  const out = new Set();
  const base = String(label || "");
  out.add(base);

  const paren = base.match(/\(([^)]+)\)/g);
  if (paren) {
    for (const p of paren) out.add(p.replace(/[()]/g, "").trim());
    out.add(base.replace(/\(([^)]+)\)/g, "").replace(/\s{2,}/g, " ").trim());
  }

  const parts = base.split(/[\/\-\–\—:\;\,\|\•]/g);
  for (const p of parts) {
    const t = p.trim();
    if (t) out.add(t);
  }

  return Array.from(out).filter(Boolean);
}

function withBust(url) {
  const u = new URL(url);
  u.searchParams.set("_", String(Date.now()));
  return u.toString();
}
