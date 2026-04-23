# Freeway Usage Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify usage generation for existing OpenAI-compatible and Anthropic-compatible responses so non-stream responses always produce stable usage fields and streaming responses stop emitting misleading placeholder usage.

**Architecture:** Add a small gateway-level usage normalization module and wire it into the existing server and Anthropic bridge paths without changing routing or provider abstractions. Prefer provider-reported usage when present, fall back to conservative estimation for non-stream responses, and omit fake streaming usage when no reliable data exists.

**Tech Stack:** TypeScript, Node.js HTTP server, existing Anthropic bridge, existing provider adapters, TypeScript compiler.

---

## File map

- Create: `src/usage.ts` — gateway-level usage normalization, estimation, and OpenAI/Anthropic formatting helpers.
- Modify: `src/server.ts` — normalize non-stream OpenAI-compatible responses before returning them.
- Modify: `src/anthropic-bridge.ts` — consume normalized usage for Anthropic non-stream responses and stop emitting placeholder zero usage in stream events.
- Modify: `src/providers/cohere.ts` — keep existing Cohere usage mapping compatible with the new normalization helpers if needed.
- Modify: `src/types.ts` — add minimal shared types only if the helper signatures need them.
- Create: `scripts/usage-regression.mjs` — minimal Node-based regression checks because the repo currently has no `tests/` directory.
- Modify: `package.json` — add a narrow verification script only if needed for running the regression checks consistently.

## Task 1: Add a lightweight regression harness

**Files:**
- Create: `scripts/usage-regression.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing regression script**

```js
import assert from 'node:assert/strict';
import { toAnthropicResponse } from '../dist/anthropic-bridge.js';

const responseWithoutUsage = {
  id: 'chatcmpl-test',
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'hello world',
      },
    },
  ],
};

const anthropic = toAnthropicResponse(responseWithoutUsage, 'demo-model');

assert.equal(typeof anthropic.usage?.input_tokens, 'number');
assert.equal(typeof anthropic.usage?.output_tokens, 'number');
assert.notEqual(anthropic.usage.input_tokens, 0);
assert.notEqual(anthropic.usage.output_tokens, 0);

console.log('usage regression checks passed');
```

- [ ] **Step 2: Add a script entry for the regression harness**

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test:usage": "npm run build && node scripts/usage-regression.mjs"
  }
}
```

- [ ] **Step 3: Run the regression script to verify it fails before implementation**

Run:
```bash
npm run test:usage
```

Expected: FAIL because `toAnthropicResponse(...)` currently returns zero-like fallback usage for missing provider usage.

- [ ] **Step 4: Commit the failing harness**

```bash
git add package.json scripts/usage-regression.mjs
git commit -m "test: add usage regression harness"
```

## Task 2: Add the gateway usage normalization module

**Files:**
- Create: `src/usage.ts`
- Modify: `src/types.ts`
- Test: `scripts/usage-regression.mjs`

- [ ] **Step 1: Add the shared usage helper module**

```ts
export interface NormalizedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated: boolean;
}

export interface UsageEstimationInput {
  promptText: string;
  completionText: string;
}

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateUsage(input: UsageEstimationInput): NormalizedUsage {
  const prompt_tokens = estimateTokens(input.promptText);
  const completion_tokens = estimateTokens(input.completionText);
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
    estimated: true,
  };
}

export function normalizeOpenAIUsage(value: unknown): NormalizedUsage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Record<string, unknown>;
  const prompt_tokens = Number(usage.prompt_tokens ?? 0);
  const completion_tokens = Number(usage.completion_tokens ?? 0);
  const total_tokens = Number(usage.total_tokens ?? prompt_tokens + completion_tokens);

  if (!Number.isFinite(prompt_tokens) || !Number.isFinite(completion_tokens) || !Number.isFinite(total_tokens)) {
    return null;
  }

  return {
    prompt_tokens: Math.max(0, prompt_tokens),
    completion_tokens: Math.max(0, completion_tokens),
    total_tokens: Math.max(0, total_tokens),
    estimated: false,
  };
}

export function ensureUsage(value: unknown, input: UsageEstimationInput): NormalizedUsage {
  return normalizeOpenAIUsage(value) ?? estimateUsage(input);
}

export function toOpenAIUsage(usage: NormalizedUsage) {
  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  };
}

export function toAnthropicUsage(usage: NormalizedUsage) {
  return {
    input_tokens: usage.prompt_tokens,
    output_tokens: usage.completion_tokens,
  };
}
```

- [ ] **Step 2: Add only the minimal shared type exports needed by the helper**

```ts
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

Only add this to `src/types.ts` if the helper imports become clearer with a shared type; otherwise skip this step and keep the type local to `src/usage.ts`.

- [ ] **Step 3: Extend the regression harness to assert normalized OpenAI usage formatting**

```js
import { ensureUsage, toOpenAIUsage } from '../dist/usage.js';

const normalized = ensureUsage(null, {
  promptText: 'system: ping\nuser: ping',
  completionText: 'pong',
});

const openaiUsage = toOpenAIUsage(normalized);
assert.equal(typeof openaiUsage.prompt_tokens, 'number');
assert.equal(typeof openaiUsage.completion_tokens, 'number');
assert.equal(openaiUsage.total_tokens, openaiUsage.prompt_tokens + openaiUsage.completion_tokens);
```

- [ ] **Step 4: Run the regression script to verify the helper works in isolation**

Run:
```bash
npm run test:usage
```

Expected: still FAIL overall because the Anthropic/OpenAI response paths have not been wired to the helper yet, but the helper import should succeed and helper-only assertions should pass.

- [ ] **Step 5: Commit the usage helper**

```bash
git add src/usage.ts src/types.ts scripts/usage-regression.mjs
git commit -m "feat: add gateway usage normalization helpers"
```

## Task 3: Normalize Anthropic non-stream usage and remove fake stream usage

**Files:**
- Modify: `src/anthropic-bridge.ts`
- Test: `scripts/usage-regression.mjs`

- [ ] **Step 1: Wire `toAnthropicResponse(...)` to the new usage helper**

Replace the current direct usage extraction with the helper flow:

```ts
import { ensureUsage, toAnthropicUsage } from './usage.js';
```

Inside `toAnthropicResponse(...)`, replace the current usage logic with:

```ts
const normalizedUsage = ensureUsage(openAIResponse.usage, {
  promptText: JSON.stringify(openAIResponse.messages ?? openAIResponse),
  completionText: contentText,
});
```

Then return:

```ts
usage: toAnthropicUsage(normalizedUsage),
```

If `openAIResponse.messages` is not available in this function, use a narrow prompt fallback like `JSON.stringify(message)` plus any available prompt context already present in scope. Do not add a broad request plumbing refactor in this step.

- [ ] **Step 2: Stop emitting placeholder zero usage in Anthropic stream start/end events**

Adjust `anthropicStreamStart(...)` to remove the `usage` object from the synthetic `message_start` event:

```ts
message: {
  id: `msg-${Date.now()}`,
  type: 'message',
  role: 'assistant',
  content: [],
  model: modelId,
  stop_reason: null,
}
```

Adjust `createAnthropicStreamTransformer().end()` to remove the fake zero `usage` payload from `message_delta`:

```ts
out += sseEvent({
  type: 'message_delta',
  delta: { stop_reason: stopReason, stop_sequence: null },
});
```

- [ ] **Step 3: Expand the regression harness to cover Anthropic usage mapping and stream output**

```js
import { anthropicStreamStart, createAnthropicStreamTransformer } from '../dist/anthropic-bridge.js';

const startEvent = anthropicStreamStart('demo-model');
assert.equal(startEvent.includes('"usage"'), false);

const transformer = createAnthropicStreamTransformer();
const endEvent = transformer.end();
assert.equal(endEvent.includes('"usage"'), false);
```

- [ ] **Step 4: Run the regression harness to verify Anthropic behavior passes**

Run:
```bash
npm run test:usage
```

Expected: Anthropic-related assertions PASS.

- [ ] **Step 5: Commit the Anthropic usage changes**

```bash
git add src/anthropic-bridge.ts scripts/usage-regression.mjs
git commit -m "fix: normalize anthropic usage output"
```

## Task 4: Normalize OpenAI non-stream usage in the server path

**Files:**
- Modify: `src/server.ts`
- Modify: `src/usage.ts`
- Test: `scripts/usage-regression.mjs`

- [ ] **Step 1: Add a focused response normalizer in `src/usage.ts`**

```ts
export function normalizeOpenAIResponseUsage(
  payload: Record<string, unknown>,
  promptText: string,
  completionText: string,
) {
  const normalizedUsage = ensureUsage(payload.usage, {
    promptText,
    completionText,
  });

  return {
    ...payload,
    usage: toOpenAIUsage(normalizedUsage),
  };
}
```

- [ ] **Step 2: Parse and normalize non-stream OpenAI responses in `src/server.ts`**

Inside the non-stream `/v1/chat/completions` branch, replace the direct `response.text()` return with:

```ts
const rawBody = await response.text();
const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
const completionText = String(
  ((parsedBody.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)?.content ?? ''
);
const promptText = JSON.stringify(request.messages ?? []);
const normalizedBody = normalizeOpenAIResponseUsage(parsedBody, promptText, completionText);
const body = JSON.stringify(normalizedBody);
```

Keep the existing header and status handling unchanged.

- [ ] **Step 3: Add a regression harness case for OpenAI response normalization**

```js
import { normalizeOpenAIResponseUsage } from '../dist/usage.js';

const normalizedResponse = normalizeOpenAIResponseUsage(
  {
    id: 'chatcmpl-openai',
    choices: [{ message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
  },
  'user: ping',
  'pong',
);

assert.equal(typeof normalizedResponse.usage.prompt_tokens, 'number');
assert.equal(typeof normalizedResponse.usage.completion_tokens, 'number');
assert.equal(
  normalizedResponse.usage.total_tokens,
  normalizedResponse.usage.prompt_tokens + normalizedResponse.usage.completion_tokens,
);
```

- [ ] **Step 4: Run the regression harness to verify the OpenAI normalization passes**

Run:
```bash
npm run test:usage
```

Expected: PASS with `usage regression checks passed`.

- [ ] **Step 5: Commit the OpenAI normalization changes**

```bash
git add src/server.ts src/usage.ts scripts/usage-regression.mjs
git commit -m "fix: normalize openai usage output"
```

## Task 5: Align the Cohere provider with the normalization path

**Files:**
- Modify: `src/providers/cohere.ts`
- Test: `scripts/usage-regression.mjs`

- [ ] **Step 1: Verify the Cohere adapter continues to emit OpenAI-style usage fields expected by `normalizeOpenAIUsage(...)`**

Keep the response shape at:

```ts
usage: {
  prompt_tokens: tokens?.input_tokens ?? 0,
  completion_tokens: tokens?.output_tokens ?? 0,
  total_tokens: (tokens?.input_tokens ?? 0) + (tokens?.output_tokens ?? 0),
}
```

Only change this file if the helper integration reveals a mismatch; avoid refactoring unrelated provider code.

- [ ] **Step 2: Add a Cohere-shaped usage case to the regression harness**

```js
const normalizedCohereUsage = ensureUsage(
  {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
  },
  { promptText: 'ignored', completionText: 'ignored' },
);

assert.equal(normalizedCohereUsage.prompt_tokens, 12);
assert.equal(normalizedCohereUsage.completion_tokens, 8);
assert.equal(normalizedCohereUsage.total_tokens, 20);
assert.equal(normalizedCohereUsage.estimated, false);
```

- [ ] **Step 3: Run the regression harness to verify provider compatibility**

Run:
```bash
npm run test:usage
```

Expected: PASS.

- [ ] **Step 4: Commit the provider compatibility check**

```bash
git add src/providers/cohere.ts scripts/usage-regression.mjs
git commit -m "test: cover provider usage compatibility"
```

## Task 6: End-to-end manual verification

**Files:**
- Modify: none unless a defect is found
- Test: local running server plus existing endpoints

- [ ] **Step 1: Build and start the server**

Run:
```bash
npm run build && npm start
```

Expected: `Freeway running on http://localhost:8787`

- [ ] **Step 2: Verify OpenAI non-stream usage is always present**

Run:
```bash
curl -sS -X POST "http://localhost:8787/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"hy3-preview-free","stream":false,"messages":[{"role":"user","content":"ping"}]}'
```

Expected: JSON response with a top-level `usage` object containing `prompt_tokens`, `completion_tokens`, and `total_tokens`.

- [ ] **Step 3: Verify Anthropic non-stream usage is always present**

Run:
```bash
curl -sS -X POST "http://localhost:8787/v1/messages" \
  -H "Content-Type: application/json" \
  -d '{"model":"hy3-preview-free","messages":[{"role":"user","content":"ping"}]}'
```

Expected: JSON response with `usage.input_tokens` and `usage.output_tokens` and no placeholder zero-only behavior when provider usage is absent.

- [ ] **Step 4: Verify Anthropic stream no longer emits fake zero usage**

Run:
```bash
curl -sN -X POST "http://localhost:8787/v1/messages?beta=true" \
  -H "Content-Type: application/json" \
  -d '{"model":"hy3-preview-free","stream":true,"messages":[{"role":"user","content":"ping"}]}'
```

Expected: SSE events do not contain synthetic `"usage":{"input_tokens":0,"output_tokens":0}` or similar placeholder zero usage blocks.

- [ ] **Step 5: Commit the final verified implementation**

```bash
git add src/usage.ts src/server.ts src/anthropic-bridge.ts src/providers/cohere.ts/usage-regression.mjs package.json
git commit -m "feat: unify gateway usage handling"
```

## Self-review

- Spec coverage: the plan covers gateway usage normalization, OpenAI non-stream usage, Anthropic non-stream usage, conservative streaming behavior, provider compatibility, and verification. It intentionally excludes `count_tokens` and new API surfaces.
- Placeholder scan: no `TODO`, `TBD`, or implicit “write tests later” steps remain.
- Type consistency: `NormalizedUsage`, `ensureUsage`, `toOpenAIUsage`, and `toAnthropicUsage` are introduced before later tasks reference them.
