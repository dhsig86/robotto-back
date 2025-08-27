import { z } from "zod";

export const ExtractSchema = z.object({
  features: z.array(z.string()).default([]),
  modifiers: z.record(z.any()).default({}),
  demographics: z
    .object({
      idade: z.number().int().min(0).max(120).nullable().optional(),
      sexo: z.enum(["M", "F"]).nullable().optional(),
      comorbidades: z.array(z.string()).default([])
    })
    .default({})
});
