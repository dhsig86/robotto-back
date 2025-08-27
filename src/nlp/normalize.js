import { normalizeStr, stripDiacritics } from "../utils/text.js";

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os",
  "para", "no", "na", "nos", "nas", "com", "em", "por", "um", "uma"
]);

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

  // Idade (ex.: 65 anos)
  const ageMatch = raw.match(/(\d{1,3})\s*(anos?|a)\b/i);
  if (ageMatch) {
    const a = Number(ageMatch[1]);
    if (a >= 0 && a <= 120) demographics.idade = a;
  }

  // Temperatura (°C)
  const temp = raw.match(/(\d{2}(?:\.\d)?)\s*(?:°\s*C|graus?\s*C|c\s*º)/i);
  if (temp) modifiers["temperatura_c"] = Number(temp[1]);

  // ===== mapeamento por aliases =====
  // 1) match direto por substring normalizada
  for (const [aliasNorm, fid] of registry.aliasToId.entries()) {
    if (!allowed.has(fid)) continue;
    if (norm.includes(aliasNorm)) features.add(fid);
  }

  // 2) bag-of-words (todas as palavras relevantes do alias presentes)
  for (const [aliasNorm, fid] of registry.aliasToId.entries()) {
    if (!allowed.has(fid)) continue;
    if (features.has(fid)) continue; // já casou por substring
    const words = aliasNorm.split(/\s+/).filter((w) => w && !STOP.has(w) && w.length >= 2);
    if (words.length && words.every((w) => tokens.has(w))) {
      features.add(fid);
    }
  }

  // 3) heurística por tokens do ID (ex.: rinite_alergica -> ["rinite","alergica"])
  for (const fid of allowed) {
    const tkns = fid.split(/[_\.]/).map(stripDiacritics);
    if (tkns.every((t) => tokens.has(t))) features.add(fid);
  }

  return { features: Array.from(features), modifiers, demographics };
}
