import { normalizeStr, stripDiacritics } from "../utils/text.js";

const STOP = new Set(["de","da","do","das","dos","e","a","o","as","os","para","no","na","nos","nas","com","em","por","um","uma"]);

export function fallbackExtract({ text, registry, allowed }) {
  const features = new Set();
  const modifiers = {};
  const demographics = { idade: null, sexo: null, comorbidades: [] };

  const raw = String(text || "");
  const norm = normalizeStr(raw);
  const tokens = new Set(norm.split(/\s+/).filter(Boolean));

  // sexo
  if (/\b(sexo[:\s]*)?(masculino|homem|m)\b/.test(norm)) demographics.sexo = "M";
  if (/\b(sexo[:\s]*)?(feminino|mulher|f)\b/.test(norm)) demographics.sexo = "F";

  // idade
  const ageMatch = raw.match(/(\d{1,3})\s*(anos?|a)\b/i);
  if (ageMatch) {
    const a = Number(ageMatch[1]);
    if (a >= 0 && a <= 120) demographics.idade = a;
  }

  // temperatura (°C)
  const temp = raw.match(/(\d{2}(?:\.\d)?)\s*(?:°\s*C|graus?\s*C|c\s*º)/i);
  if (temp) modifiers["temperatura_c"] = Number(temp[1]);

  // 1) substring normalizada
  for (const [aliasNorm, fid] of registry.aliasToId.entries()) {
    if (!allowed.has(fid)) continue;
    if (norm.includes(aliasNorm)) features.add(fid);
  }

  // 2) bag-of-words do alias
  for (const [aliasNorm, fid] of registry.aliasToId.entries()) {
    if (!allowed.has(fid) || features.has(fid)) continue;
    const words = aliasNorm.split(/\s+/).filter((w) => w && !STOP.has(w) && w.length >= 2);
    if (words.length && words.every((w) => tokens.has(w))) features.add(fid);
  }

  // 3) tokens do próprio ID (ex.: rinite_alergica → rinite alergica)
  for (const fid of allowed) {
    const tkns = fid.split(/[_\.]/).map(stripDiacritics);
    if (tkns.every((t) => tokens.has(t))) features.add(fid);
  }

  return { features: Array.from(features), modifiers, demographics };
}
