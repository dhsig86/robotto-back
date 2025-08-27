import { loadConfig } from "./config.js";
import { normalizeStr } from "./utils/text.js";

let _cache = null;
let _ts = 0;

export async function getRegistry(warm = false) {
  const fresh = Date.now() - _ts < 10 * 60 * 1000;
  if (_cache && fresh && !warm) return _cache;

  const cfg = loadConfig();
  if (!cfg.REGISTRY_URL) {
    if (!_cache) _cache = emptyRegistry();
    return _cache;
  }

  try {
    const res = await fetch(cfg.REGISTRY_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`registry fetch ${res.status}`);
    const snap = await res.json();

    const featuresSet = new Set();
    const idToMeta = {};
    const aliasToId = new Map();

    const features = snap.features || snap.featuresMap || {};
    for (const [fid, meta] of Object.entries(features)) {
      featuresSet.add(fid);
      idToMeta[fid] = meta || {};

      // ===== construir aliases =====
      const rawAliases = new Set();

      // 1) aliases declarados
      if (Array.isArray(meta?.aliases)) meta.aliases.forEach((x) => rawAliases.add(x));

      // 2) label completo
      if (meta?.label) rawAliases.add(meta.label);

      // 3) variações do label (antes/dentro de parênteses; split por separadores)
      if (meta?.label) {
        explodeLabel(meta.label).forEach((x) => rawAliases.add(x));
      }

      // 4) variações do fid
      rawAliases.add(fid);
      rawAliases.add(fid.replaceAll("_", " "));
      rawAliases.add(fid.replaceAll(".", " "));

      // normalizar e registrar
      for (const raw of rawAliases) {
        const key = normalizeStr(raw);
        if (key) aliasToId.set(key, fid);
      }
    }

    _cache = { raw: snap, featuresSet, idToMeta, aliasToId };
    _ts = Date.now();
    return _cache;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[registryLoader]", err.message);
    if (!_cache) _cache = emptyRegistry();
    return _cache;
  }
}

function emptyRegistry() {
  return { raw: {}, featuresSet: new Set(), idToMeta: {}, aliasToId: new Map() };
}

export function allowedFeaturesFrom(bodyMap, reg) {
  const fromClient = Array.isArray(bodyMap) ? bodyMap : [];
  const byClient = new Set(fromClient);
  if (byClient.size) return byClient;
  return reg?.featuresSet || new Set();
}

/** Quebra labels em partes úteis:
 *  - tira conteúdo entre parênteses (mantém dentro e fora)
 *  - split por / - – — : ; , | •
 *  - trim e remove vazios
 */
function explodeLabel(label) {
  const out = new Set();
  const base = String(label || "");

  // label inteiro
  out.add(base);

  // dentro/fora de parênteses
  const paren = base.match(/\(([^)]+)\)/g);
  if (paren) {
    for (const p of paren) {
      out.add(p.replace(/[()]/g, "").trim());
    }
    out.add(base.replace(/\(([^)]+)\)/g, "").replace(/\s{2,}/g, " ").trim());
  }

  // split por separadores comuns
  const parts = base.split(/[\/\-\–\—:\;\,\|\•]/g);
  for (const p of parts) {
    const t = p.trim();
    if (t) out.add(t);
  }

  return Array.from(out).filter(Boolean);
}
