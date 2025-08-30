// ROBOTTO backend — registry loader com coercion, fallbacks e reindexação de segurança
import { loadConfig } from "./config.js";
import { normalizeStr } from "./utils/text.js";

let _cache = null;
let _ts = 0;

export async function getRegistry(warm = false) {
  const fresh = Date.now() - _ts < 10 * 60 * 1000;
  if (_cache && fresh && !warm) return _cache;

  const cfg = loadConfig();
  const out = { raw: {}, featuresSet: new Set(), idToMeta: {}, aliasToId: new Map() };

  // 1) tenta snapshot (REGISTRY_URL)
  let snap = null;
  if (cfg.REGISTRY_URL) {
    try {
      const res = await fetch(cacheBust(cfg.REGISTRY_URL), { cache: "no-store" });
      if (!res.ok) throw new Error(`registry fetch ${res.status}`);
      snap = await res.json();
      out.raw.snapshot_ok = true;
    } catch (e) {
      console.error("[registryLoader] REGISTRY_URL error:", e.message);
      out.raw.snapshot_ok = false;
    }
  }

  // 2) extrai possíveis formatos do snapshot (pode vir em várias formas)
  let { featuresMap, redflagsMap, byGlobalId } = extractFromSnapshot(snap);

  // 3) coagir featuresMap para mapa id->meta (funciona para {version, features:[]}, lista pura, ou mapa)
  featuresMap = coerceFeaturesMap(featuresMap);

  // 4) fallbacks diretos se vazio
  if (!featuresMap || !Object.keys(featuresMap).length) {
    if (cfg.FEATURES_URL) {
      try {
        const r = await fetch(cacheBust(cfg.FEATURES_URL), { cache: "no-store" });
        if (r.ok) {
          const json = await r.json();
          featuresMap = coerceFeaturesMap(json);
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
        const r = await fetch(cacheBust(cfg.REDFLAGS_URL), { cache: "no-store" });
        if (r.ok) {
          redflagsMap = await r.json();
          out.raw.redflags_fallback = true;
        }
      } catch (e) {
        console.error("[registryLoader] REDFLAGS_URL error:", e.message);
      }
    }
  }

  // 5) indexar (1ª passada)
  indexAll(out, featuresMap, redflagsMap, byGlobalId);

  // 6) guard-rail: se ainda ficou 0 (snapshot estranho), força fallback e reindexa
  if (out.featuresSet.size === 0 && cfg.FEATURES_URL) {
    try {
      const r = await fetch(cacheBust(cfg.FEATURES_URL), { cache: "no-store" });
      if (r.ok) {
        const json = await r.json();
        featuresMap = coerceFeaturesMap(json);
        out.raw.features_forced_fallback = true;

        // reindexa
        indexAll(out, featuresMap, redflagsMap, byGlobalId);
      }
    } catch (e) {
      console.error("[registryLoader] forced FEATURES_URL error:", e.message);
    }
  }

  _cache = out;
  _ts = Date.now();

  console.log(
    "[registryLoader] loaded",
    "features:", out.featuresSet.size,
    "aliases:", out.aliasToId.size,
    "snapshot_ok:", !!out.raw.snapshot_ok,
    "fallbackF:", !!out.raw.features_fallback || !!out.raw.features_forced_fallback,
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

/* ================= helpers ================= */

function extractFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return { featuresMap: {}, redflagsMap: {}, byGlobalId: {} };

  // Tenta múltiplos caminhos conhecidos
  const featuresMap =
    snap.featuresMap ||
    snap.features ||                            // pode ser lista
    snap.byFeatureId ||
    snap.registry?.featuresMap ||
    snap.registry?.features ||                  // lista
    snap.global?.featuresMap ||
    snap.global?.features ||                    // lista
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

/** Aceita:
 *  - { version, features: [ {id,label,aliases}... ] }
 *  - [ {id,label,aliases}... ]
 *  - { id: {label,aliases}, ... }
 */
function coerceFeaturesMap(input) {
  if (!input) return {};
  // caso: { version, features: [...] }
  if (!Array.isArray(input) && Array.isArray(input.features)) return coerceFeaturesMap(input.features);
  // caso: lista pura
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
  // caso: já é mapa (ou objeto qualquer) — se não tiver nenhuma key típica, devolve {} para forçar fallback
  const keys = Object.keys(input);
  const looksLikeMap = keys.some((k) => /^[a-z0-9_.]+$/.test(k)); // feature ids
  if (!looksLikeMap) return {};
  return input;
}

function splitAliases(s) {
  // separa por vírgula, ponto-e-vírgula, pipe — e se não houver, usa a string inteira
  const base = String(s || "").trim();
  const parts = base.split(/[;,|]/g).map((x) => x.trim()).filter(Boolean);
  const set = new Set(parts.length ? parts : [base]);
  return Array.from(set);
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

function indexAll(out, featuresMap, redflagsMap, byGlobalId) {
  const featuresSet = new Set();
  const idToMeta = {};
  const aliasToId = new Map();

  for (const [fid, metaRaw] of Object.entries(featuresMap || {})) {
    const meta = metaRaw || {};
    featuresSet.add(fid);
    idToMeta[fid] = meta;

    const rawAliases = new Set();

    // aliases do arquivo
    if (Array.isArray(meta.aliases)) {
      meta.aliases.forEach((x) => x && rawAliases.add(String(x)));
    } else if (typeof meta.aliases === "string" && meta.aliases.trim()) {
      splitAliases(meta.aliases).forEach((x) => rawAliases.add(x));
    }

    // label expandido
    if (meta.label) {
      rawAliases.add(meta.label);
      explodeLabel(meta.label).forEach((x) => rawAliases.add(x));
    }

    // variantes do id
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
  out.featuresMap = featuresMap || {};
  out.redflags = normalizeRedflags(redflagsMap || {});
  out.byGlobalId = byGlobalId || {};
}

function cacheBust(url) {
  const u = new URL(url);
  u.searchParams.set("_", String(Date.now()));
  return u.toString();
}
