<p align="center">
  <img src="Assets/Head.png" alt="Freeway cover" width="880" />
</p>

<h1 align="center">Freeway</h1>

<p align="center">
  OpenAI-compatible gateway for free-tier LLM providers, with a built-in web console,
  health checks, dynamic model sync, and Anthropic-compatible bridging.
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./CONTRIBUTING.md">Contributing (EN)</a> ·
  <a href="./contribution.md">贡献指南 (中文)</a>
</p>

## Overview

Freeway is a TypeScript/Node.js local gateway that unifies multiple free LLM providers behind a single API surface.

It provides:
- OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/models`)
- Anthropic-compatible endpoint (`/v1/messages`)
- Provider health checks and latency/status telemetry
- Provider/model catalog in a local web console
- Runtime key management with persistent local storage
- Dynamic model sync with cache fallback

## Key Features

- **Single endpoint, multi-provider routing**
  - Route the same model across multiple providers.
  - Force provider with prefixed model IDs like `groq/llama-3.3-70b`.
- **Web console for operations**
  - Provider status, filters, test actions, model browser, API key management, and request testing.
- **Anthropic bridge**
  - Convert Anthropic Messages API requests into OpenAI-style requests and map responses back.
- **Safe local persistence**
  - Keys saved to `.freeway/config.json` (local only, outside source tree logic).
- **Startup model cache + background refresh**
  - Loads cached models fast on boot, then syncs providers in background.

## Supported Providers

Currently configured in `src/providers/index.ts`:

`openrouter`, `groq`, `github`, `cloudflare`, `siliconflow`, `cerebras`, `mistral`, `cohere`, `nvidia`, `llm7`, `kilo`, `zhipu`, `opencode`

## Quick Start

### 1) Prerequisites

- Node.js 18+
- npm

### 2) Install and run

```bash
npm install
npm run build
npm start
```

Server default: `http://localhost:8787`

### 3) Open the console

Visit:

- `http://localhost:8787/`

Then set provider keys in **API Keys** tab, or pass keys via environment variables.

## Configuration

### API key sources and precedence

Effective key precedence is:

1. Runtime key set via UI/API
2. Environment variable
3. Persisted `.freeway/config.json`

### Common environment variables

| Variable | Purpose |
|---|---|
| `FREEWAY_API_KEY` | Optional gateway auth key for clients calling Freeway |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `GROQ_API_KEY` | Groq key |
| `GITHUB_TOKEN` | GitHub Models token |
| `CLOUDFLARE_API_KEY` | Cloudflare API key |
| `CLOUDFLARE_ACCOUNT_ID` | Required for Cloudflare model sync |
| `SILICONFLOW_API_KEY` | SiliconFlow key |
| `CEREBRAS_API_KEY` | Cerebras key |
| `MISTRAL_API_KEY` | Mistral key |
| `COHERE_API_KEY` | Cohere key |
| `NVIDIA_API_KEY` | NVIDIA NIM key |
| `LLM7_API_KEY` | LLM7 key |
| `KILO_API_KEY` | Kilo key |
| `ZHIPU_API_KEY` | Zhipu/BigModel key |
| `OPENCODE_API_KEY` | OpenCode key |
| `HTTP_PROXY` | Optional global HTTP proxy for outbound provider calls |

## API Usage

### OpenAI-compatible chat completion

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREEWAY_API_KEY" \
  -d '{
    "model": "llama-3.3-70b",
    "messages": [{"role": "user", "content": "Say hello from Freeway"}],
    "stream": false
  }'
```

### Force a provider

```json
{
  "model": "groq/llama-3.3-70b"
}
```

### Anthropic-compatible messages endpoint

```bash
curl http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREEWAY_API_KEY" \
  -d '{
    "model": "llama-3.3-70b",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web console |
| `GET` | `/health` | Service health |
| `GET` | `/api/catalog` | Provider/model/health summary |
| `POST` | `/api/health/check/:provider` | Check one provider |
| `POST` | `/api/health/check-all` | Check all providers |
| `POST` | `/api/models/refresh` | Refresh provider model lists |
| `POST` | `/api/config/keys` | Save runtime/persisted keys |
| `GET` | `/v1/models` | OpenAI-compatible models list |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions |
| `POST` | `/v1/messages` | Anthropic-compatible messages |

## Project Structure

```text
src/
  index.ts                # Entry point
  server.ts               # HTTP server + routes + static hosting
  router.ts               # Provider routing and retry logic
  providers/              # Provider definitions and model sync orchestration
  models/                 # Canonical model registry + sync/cache adapters
  web/                    # Console UI (HTML/CSS/JS)
  config*.ts              # Runtime + persisted key config
  health.ts               # Provider health checks and summary
  anthropic-bridge.ts     # Anthropic <-> OpenAI request/response bridge
```

## Development

```bash
npm run dev     # TypeScript watch build
npm run build   # Compile to dist/
npm start       # Run compiled server
```

## Contributing

Please read [contribution.md](./contribution.md).

## License

MIT