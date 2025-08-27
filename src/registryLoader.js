// Carrega e mantém em memória o "registry.snapshot.json" gerado pelo seu script.
// Constrói featuresSet + aliasesMap a partir de labels/aliases para auxiliar extração local.
import { loadConfig } from "./config.js";
import { normalizeStr, unique } from "./utils/text.js";

let _cache = null;
let _ts = 0;

export async function getRegistry(warm = false) {
  const fresh = Date.now() - _ts < 10 * 60 * 1000; // 10 min cache
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

    // Esperado (flexível): snap.features (id → { label, aliases?[] })
    //                      snap.lexicons? (opcional)
    //                      snap.redflags? (opcional)
    const featuresSet = new Set();
    const idToMeta = {};
    const aliasToId = new Map();

    const features = snap.features || snap.featuresMap || {};
    for (const [fid, meta] of Object.entries(features)) {
      featuresSet.add(fid);
      idToMeta[fid] = meta || {};
      // Aliases: do próprio arquivo + derivações simples do id/label
      const a = new Set();
      if (Array.isArray(meta?.aliases)) meta.aliases.forEach((x) => a.add(x));
      if (meta?.label) a.add(meta.label);
      // Derivações
      a.add(fid.replaceAll("_", " "));
      a.add(fid.replaceAll(".", " "));
      a.add(fid);
      // Normaliza e grava
      for (const raw of a) {
        const key = normalizeStr(raw);
        if (key) aliasToId.set(key, fid);
      }
    }

    _cache = {
      raw: snap,
      featuresSet,
      idToMeta,
      aliasToId,
    };
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
  return {
    raw: {},
    featuresSet: new Set(),
    idToMeta: {},
    aliasToId: new Map(),
  };
}

// Utilitário público
export function allowedFeaturesFrom(bodyMap, reg) {
  // prioridade: lista vinda do front; senão, usa o registry
  const fromClient = Array.isArray(bodyMap) ? bodyMap : [];
  const byClient = new Set(fromClient);
  if (byClient.size) return byClient;

  return reg?.featuresSet || new Set();
}
