import { Router } from "express";
import { getRegistry, allowedFeaturesFrom } from "../registryLoader.js";
import { llmExtract } from "../services/llm.js";
import { fallbackExtract } from "../nlp/normalize.js";
import { metrics, bump } from "../metrics.js";

const router = Router();

router.post("/", async (req, res) => {
  bump("requests");

  const { text = "", want = "extract", featuresMap = [] } = req.body || {};
  if (want !== "extract") {
    return res.status(400).json({ ok: false, error: "only 'extract' supported for now" });
  }

  const registry = await getRegistry();
  const allowed = allowedFeaturesFrom(featuresMap, registry);

  let llmOut = null;
  if (text && allowed.size) {
    bump("llm_calls");
    llmOut = await llmExtract({ text, featuresUniverse: allowed });
    if (llmOut) bump("llm_success");
  }

  const fb = fallbackExtract({ text, registry, allowed });
  if (fb.features?.length) bump("fallback_hits");

  const mergedFeatures = Array.from(new Set([...(llmOut?.features || []), ...(fb.features || [])])).filter((f) =>
    allowed.has(f)
  );
  bump("merged_features_total", mergedFeatures.length);

  return res.json({
    features: mergedFeatures,
    modifiers: { ...(fb.modifiers || {}), ...(llmOut?.modifiers || {}) },
    demographics: { ...(fb.demographics || {}), ...(llmOut?.demographics || {}) }
  });
});

export default router;
