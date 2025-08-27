// Contadores em memória para debug leve
export const metrics = {
  requests: 0,
  llm_calls: 0,
  llm_success: 0,
  fallback_hits: 0,
  merged_features_total: 0
};

export function bump(key, inc = 1) {
  if (metrics[key] === undefined) metrics[key] = 0;
  metrics[key] += inc;
}
