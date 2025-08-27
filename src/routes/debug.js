import { Router } from "express";
import { getRegistry } from "../registryLoader.js";

const router = Router();

router.get("/debug", async (_req, res) => {
  const reg = await getRegistry();
  const sample = [];
  let i = 0;
  for (const [alias, fid] of reg.aliasToId.entries()) {
    if (i++ >= 50) break;
    sample.push({ alias, fid });
  }
  res.json({
    features_count: reg.featuresSet.size,
    aliases_count: reg.aliasToId.size,
    sample_aliases: sample
  });
});

export default router;
