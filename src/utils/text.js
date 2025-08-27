export function stripDiacritics(s = "") {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function normalizeStr(s = "") {
  return stripDiacritics(String(s)).replace(/[^\p{Letter}\p{Number}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function unique(arr) {
  return Array.from(new Set(arr));
}
