import { loadConfig } from "../config.js";
import { ExtractSchema } from "../schemas/extract.schema.js";

export async function llmExtract({ text, featuresUniverse }) {
  const cfg = loadConfig();
  if (!cfg.OPENAI_API_KEY) return null;

  const system = [
    "Você é um assistente clínico de triagem em Otorrinolaringologia.",
    "Extraia APENAS os identificadores canônicos de FEATURES presentes no texto.",
    "Somente IDs contidos no 'featuresUniverse' são válidos.",
    "Responda via função 'extract' no formato JSON.",
    "Não faça diagnóstico; apenas extração semântica de sinais/sintomas/modificadores/demografia."
  ].join(" ");

  const user = [
    `Texto do paciente (pt-BR):`,
    text,
    "",
    `featuresUniverse: ${Array.from(featuresUniverse).join(", ")}`
  ].join("\n");

  const tools = [
    {
      type: "function",
      function: {
        name: "extract",
        description: "Retorne features/modifiers/demographics extraídos do texto.",
        parameters: {
          type: "object",
          properties: {
            features: { type: "array", items: { type: "string" } },
            modifiers: { type: "object", additionalProperties: true },
            demographics: {
              type: "object",
              properties: {
                idade: { type: ["integer", "null"] },
                sexo: { type: ["string", "null"], enum: ["M", "F", null] },
                comorbidades: { type: "array", items: { type: "string" } }
              },
              additionalProperties: true
            }
          },
          required: ["features"]
        }
      }
    }
  ];

  const body = {
    model: cfg.LLM_MODEL,
    temperature: cfg.LLM_TEMPERATURE, // por requisito do nano
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    tools,
    tool_choice: { type: "function", function: { name: "extract" } }
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const data = await res.json();

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "extract") return null;

    let parsed;
    try {
      parsed = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      return null;
    }
    const out = ExtractSchema.safeParse(parsed);
    if (!out.success) return null;

    const allowed = new Set(featuresUniverse);
    const features = (out.data.features || []).filter((f) => allowed.has(f));
    return {
      features,
      modifiers: out.data.modifiers || {},
      demographics: out.data.demographics || {}
    };
  } catch {
    return null;
  }
}
