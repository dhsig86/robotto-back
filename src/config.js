export function loadConfig() {
  const {
    NODE_ENV = "production",
    OPENAI_API_KEY = "",
    LLM_MODEL = "gpt5-nano",
    LLM_TEMPERATURE = "1",
    REGISTRY_URL = "",
    ALLOW_ORIGINS = ""
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
      .filter(Boolean)
  };
}
