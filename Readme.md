# robotto-back
backend for robotto v2
# ROBOTTO — Backend (Heroku)

Backend Node/Express para extração NL de sinais/sintomas (features) com **LLM boost (gpt5-nano)** + **fallback local**.
Integra-se ao front (GitHub Pages) via `REGISTRY_URL` (usa `registry.snapshot.json`).

## Endpoints
- `GET /` — healthcheck + métricas básicas
- `POST /api/triage` — `{ text, want:"extract", featuresMap?: string[] }`  
  **retorna**: `{ features: string[], modifiers: object, demographics: { idade?, sexo?, comorbidades?[] } }`
- `GET /api/registry/debug` — amostra de aliases carregados
- `GET /api/metrics` — contadores (hit ratio LLM vs fallback etc.)

## Variáveis de ambiente
- `REGISTRY_URL` → URL do `registry.snapshot.json` publicado pelo front
- `OPENAI_API_KEY` → chave da API
- `LLM_MODEL` → ex.: `gpt5-nano`
- `LLM_TEMPERATURE` → use `1`
- `ALLOW_ORIGINS` → CSV de origins para CORS (ex.: `https://dhsig86.github.io,http://127.0.0.1:5500`)

## Dev
```bash
npm i
npm run dev
# POST http://localhost:3000/api/triage
