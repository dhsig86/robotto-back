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

      const aliases = new Set();
      if (Array.isArray(meta?.aliases)) meta.aliases.forEach((x) => aliases.add(x));
      if (meta?.label) aliases.add(meta.label);
      aliases.add(fid.replaceAll("_", " "));
      aliases.add(fid.replaceAll(".", " "));
      aliases.add(fid);

      for (const raw of aliases) {
        const key = normalizeStr(raw);
        if (key) aliasToId.set(key, fid);
      }
    }

    _cache = { raw: snap, featuresSet, idToMeta, aliasToId };
    _ts = Date.now();
    return _cache;
  } catch (err) {
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
