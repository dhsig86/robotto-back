// Router /api/triage
import { Router } from "express";
import { getRegistry, allowedFeaturesFrom } from "../registryLoader.js";
import { llmExtract } from "../services/llm.js";
import { fallbackExtract } from "../nlp/normalize.js";

const router = Router();

router.post("/", async (req, res) => {
  const { text = "", want = "extract", featuresMap = [] } = req.body || {};
  if (want !== "extract") {
    return res.status(400).json({ ok: false, error: "only 'extract' supported for now" });
  }

  const registry = await getRegistry();
  const allowed = allowedFeaturesFrom(featuresMap, registry);

  // 1) Tenta LLM
  let llmOut = null;
  if (text && allowed.size) {
    llmOut = await llmExtract({ text, featuresUniverse: allowed });
  }

  // 2) Fallback local + Merge
  const fb = fallbackExtract({ text, registry, allowed });

  const merged = {
    features: unique([...(llmOut?.features || []), ...(fb.features || [])]).filter((f) =>
      allowed.has(f)
    ),
    modifiers: { ...(fb.modifiers || {}), ...(llmOut?.modifiers || {}) },
    demographics: { ...(fb.demographics || {}), ...(llmOut?.demographics || {}) }
  };

  return res.json(merged);
});

export default router;

// util
function unique(arr) {
  return Array.from(new Set(arr));
}
