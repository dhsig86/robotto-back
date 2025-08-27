// Config centralizada (env + defaults)
export function loadConfig() {
  const {
    NODE_ENV = "production",
    OPENAI_API_KEY = "",
    LLM_MODEL = "gpt5-nano", // nome simbólico; ajuste se necessário
    LLM_TEMPERATURE = "1",   // fixo 1, por requisito do nano
    REGISTRY_URL = "",       // ex.: https://<seu_front>/registry.snapshot.json
    ALLOW_ORIGINS = "",      // CSV de origins permitidos; vazio = *
  } = process.env;

  return {
    NODE_ENV,
    OPENAI_API_KEY,
    LLM_MODEL,
    LLM_TEMPERATURE: Number(LLM_TEMPERATURE) || 1,
    REGISTRY_URL: REGISTRY_URL.trim(),
    ALLOW_ORIGINS: ALLOW_ORIGINS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
