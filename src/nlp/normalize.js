import { normalizeStr, stripDiacritics } from "../utils/text.js";

export function fallbackExtract({ text, registry, allowed }) {
  const features = new Set();
  const modifiers = {};
  const demographics = { idade: null, sexo: null, comorbidades: [] };

  const raw = String(text || "");
  const norm = normalizeStr(raw);
  const tokens = new Set(norm.split(/\s+/).filter(Boolean));

  // Sexo
  if (/\b(sexo[:\s]*)?(masculino|homem|m)\b/.test(norm)) demographics.sexo = "M";
  if (/\b(sexo[:\s]*)?(feminino|mulher|f)\b/.test(norm)) demographics.sexo = "F";

  // Idade (ex.: 65 anos / 65 a)
  const ageMatch = raw.match(/(\d{1,3})\s*(anos?|a)\b/i);
  if (ageMatch) {
    const a = Number(ageMatch[1]);
    if (a >= 0 && a <= 120) demographics.idade = a;
  }

  // Temperatura (°C)
  const temp = raw.match(/(\d{2}(?:\.\d)?)\s*(?:°\s*C|graus?\s*C|c\s*º)/i);
  if (temp) modifiers["temperatura_c"] = Number(temp[1]);

  // Aliases do registry
  for (const [aliasNorm, fid] of registry.aliasToId.entries()) {
    if (!allowed.has(fid)) continue;
    if (norm.includes(aliasNorm)) features.add(fid);
  }

  // Heurística por tokens do id
  for (const fid of allowed) {
    const tkns = fid.split(/[_\.]/).map(stripDiacritics);
    if (tkns.every((t) => tokens.has(t))) features.add(fid);
  }

  return { features: Array.from(features), modifiers, demographics };
}
