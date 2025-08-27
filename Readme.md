# ROBOTTO — Backend (Heroku)

## Endpoints
- `POST /api/triage` — `{ text, want:"extract", featuresMap?: string[] }`
  - **retorna**: `{ features: string[], modifiers: object, demographics: { idade?, sexo?, comorbidades?[] } }`

## Variáveis de ambiente
- `REGISTRY_URL` → URL do `registry.snapshot.json` do front (mantém o backend em sincronia com regras/aliases).
- `OPENAI_API_KEY`, `LLM_MODEL` (ex.: `gpt5-nano`), `LLM_TEMPERATURE=1`
- `ALLOW_ORIGINS` → CSV de origins para CORS (ou vazio = liberado).

## Deploy (Heroku)
```bash
heroku create robotto-backend
heroku buildpacks:set heroku/nodejs
heroku config:set REGISTRY_URL="https://<seu_front>/registry.snapshot.json"
heroku config:set OPENAI_API_KEY="sk-xxx"
heroku config:set LLM_MODEL="gpt5-nano"
heroku config:set LLM_TEMPERATURE="1"
git push heroku main
