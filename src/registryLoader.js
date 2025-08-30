// File: backend/src/registryLoader.js
import { loadConfig } from "./config.js";
import { normalizeStr } from "./utils/text.js";

let _cache = null;
let _ts = 0;

/**
 * Carrega o registry (snapshot + fallbacks) e indexa:
 *  - featuresSet: Set<string> de featureIds
 *  - idToMeta: { [featureId]: meta }
 *  - aliasToId: Map<aliasNormalizado, featureId>
 */
export async function getRegistry(warm = false) {
  const fresh = Date.now() - _ts < 10 * 60 * 1000;
  if (_cache && fresh && !warm) return _cache;

  const cfg = loadConfig();
  const result = { raw: {}, featuresSet: new Set(), idToMeta: {}, aliasToId: new Map() };

  // 1) tenta snapshot (REGISTRY_URL)
  let snap = null;
  if (cfg.REGISTRY_URL) {
    try {
      const res = await fetch(cacheBust(cfg.REGISTRY_URL), { cache: "no-store" });
      if (!res.ok) throw new Error(`registry fetch ${res.status}`);
      snap = await res.json();
      result.raw.snapshot = snap;
    } catch (e) {
      console.error("[registryLoader] REGISTRY_URL error:", e.message);
    }
  }

  // 2) extrai features/redflags do snapshot em formatos conhecidos
  let { featuresMap, redflagsMap } = extractFromSnapshot(snap);

  // 3) fallbacks diretos se vazio
  if (!featuresMap || !Object.keys(featuresMap).length) {
    if (cfg.FEATURES_URL) {
      try {
        const resF = await fetch(cacheBust(cfg.FEATURES_URL), { cache: "no-store" });
        if (resF.ok) {
          featuresMap = await resF.json();
          result.raw.features_fallback = true;
        }
      } catch (e) {
        console.error("[registryLoader] FEATURES_URL error:", e.message);
      }
    }
  }
  if (!redflagsMap || !Object.keys(redflagsMap).length) {
    if (cfg.REDFLAGS_URL) {
      try {
        const resR = await fetch(cacheBust(cfg.REDFLAGS_URL), { cache: "no-store" });
        if (resR.ok) {
          redflagsMap = await resR.json();
          result.raw.redflags_fallback = true;
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

  result.featuresSet = featuresSet;
  result.idToMeta = idToMeta;
  result.aliasToId = aliasToId;

  // 5) anexos úteis (se existirem) para quem usa
  result.featuresMap = featuresMap || {};
  result.redflags = redflagsMap || {};
  result.byGlobalId = snap?.byGlobalId || snap?.globalById || snap?.registry?.byGlobalId || {};
  result.redflagsByFeatureId = redflagsMap || {};

  _cache = result;
  _ts = Date.now();
  return _cache;
}

export function allowedFeaturesFrom(bodyMap, reg) {
  const fromClient = Array.isArray(bodyMap) ? bodyMap : [];
  const byClient = new Set(fromClient);
  if (byClient.size) return byClient;
  return reg?.featuresSet || new Set();
}

function emptyRegistry() {
  return { raw: {}, featuresSet: new Set(), idToMeta: {}, aliasToId: new Map() };
}

/** Tenta ler diferentes formatos conhecidos de snapshot. */
function extractFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return { featuresMap: {}, redflagsMap: {} };

  // possibilidades para features
  const fm =
    snap.featuresMap ||
    snap.features ||
    snap.byFeatureId ||
    snap.registry?.featuresMap ||
    snap.registry?.features ||
    snap.global?.featuresMap ||
    {};

  // possibilidades para redflags
  // pode vir como array, map booleano, ou objeto detalhado
  let rf =
    snap.redflagsByFeatureId ||
    snap.redflags_map ||
    snap.redflags ||
    snap.registry?.redflags ||
    snap.global?.redflags ||
    {};

  // normalizar redflags para map { featureId: true }
  if (Array.isArray(rf)) {
    const tmp = {};
    for (const k of rf) tmp[k] = true;
    rf = tmp;
  }

  return { featuresMap: fm, redflagsMap: rf };
}

/** Quebra labels em partes úteis: fora/dentro de parênteses + separadores comuns. */
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

function cacheBust(url) {
  const u = new URL(url);
  u.searchParams.set("_", String(Date.now()));
  return u.toString();
}
