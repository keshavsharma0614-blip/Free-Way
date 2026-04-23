# 2026-04-23 Freeway usage unification design

## Context

Freeway 目前已经同时提供 OpenAI-compatible 的 `/v1/chat/completions` 与 Anthropic-compatible 的 `/v1/messages`。但两侧对于 `usage` 的输出并不稳定：

- OpenAI 侧多数情况下依赖上游 provider 原样返回 `usage`
- Anthropic 侧在 `src/anthropic-bridge.ts` 中直接从 OpenAI 风格响应映射 `usage`
- 当上游没有 `usage` 或格式不稳定时，现有逻辑会出现缺失、默认 0、或不同接口表现不一致的问题
- Streaming Anthropic 响应当前还存在“占位 0 usage”的误导性输出

这会影响网关作为统一 API 层的可预测性，也会影响接入 Claude Code / 其他下游 agent 时的兼容性和可调试性。

本次第一阶段只处理**现有接口上的 usage 统一化**，不新增 `count_tokens` 等新接口，也不做大规模 provider 重构。

## Goal

建立一个网关内部统一的 usage 归一化层，使得：

1. `/v1/chat/completions` 非流式响应稳定输出 OpenAI 风格 `usage`
2. `/v1/messages` 非流式响应稳定输出 Anthropic 风格 `usage`
3. 当上游 provider 没有 usage 时，网关在非流式路径上做保守估算兜底
4. Streaming 路径遵循保守策略：不伪造 usage，能在结束时补就补，拿不到就省略
5. 改动尽量集中在网关层，复用现有 bridge/provider 逻辑，不做无关重构

## Recommended approach

### 1. Add a unified gateway usage module

新增 `src/usage.ts`，作为网关内部的 usage 归一化层。

建议内部统一结构：

```ts
interface NormalizedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated: boolean;
}
```

这个模块负责：

- 归一化上游 OpenAI 风格 usage
- 处理 provider 已做过特殊映射的 usage
- 当 usage 缺失时，根据 request / response 文本做保守估算
- 将归一化结果分别输出为：
  - OpenAI 风格 usage
  - Anthropic 风格 usage

建议提供的函数边界：

- `normalizeUsage(...)`
- `estimatePromptTokens(...)`
- `estimateCompletionTokens(...)`
- `toOpenAIUsage(...)`
- `toAnthropicUsage(...)`

### 2. Normalize usage in OpenAI non-stream responses

在 `src/server.ts` 中调整 `/v1/chat/completions` 的非流式分支。

当前逻辑基本是将上游 body 直接返回给客户端。调整后：

1. 读取上游 JSON body
2. 提取已有 usage（如果有）
3. 调用 `src/usage.ts` 归一化 usage
4. 若上游没有 usage，则使用 request messages 与响应文本做估算
5. 将稳定的 OpenAI usage 写回最终响应体

目标：所有 OpenAI 非流式响应都稳定带 `usage`。

### 3. Normalize usage in Anthropic non-stream responses

在 `src/anthropic-bridge.ts` 中调整 `toAnthropicResponse(...)` 的 usage 生成逻辑。

当前逻辑直接读取 `openAIResponse.usage`；当上游没有 usage 时，容易出现默认 0 或不稳定行为。

调整后：

1. 先走统一 usage 归一化层
2. 再把归一化后的：
   - `prompt_tokens` → `input_tokens`
   - `completion_tokens` → `output_tokens`
3. 输出 Anthropic 风格 usage

目标：所有 Anthropic 非流式响应都稳定带 `usage.input_tokens/output_tokens`。

### 4. Preserve provider-specific mapping and route it through the unified layer

`src/providers/cohere.ts` 已经在把 Cohere 的 usage 映射到 OpenAI 风格 usage。这部分逻辑应当保留，但最终产出要能被统一 usage 模块无缝消费。

原则：

- 不推翻 provider 特例
- 不要求所有 provider 在第一阶段都改成新抽象
- 只要求它们最终都能流入统一 usage 归一化层

这样能保持最小改动，同时为后续 provider 扩展留出空间。

### 5. Use a conservative strategy for streaming usage

Streaming 路径遵循已确认策略：

- 不伪造 usage
- 有真实 usage 就补
- 拿不到就省略

因此第一阶段对 `src/anthropic-bridge.ts` 中 streaming 相关逻辑的修改重点是：

- 去掉固定的占位 0 usage
- 避免向客户端传递“看起来精确但其实是假的” usage 信息

不要求第一阶段建立完整的 streaming usage 闭环统计。

## File changes

### New file
- `src/usage.ts`
  - 网关内部 usage 归一化与估算逻辑

### Modified files
- `src/server.ts`
  - `/v1/chat/completions` 非流式 usage 统一化
  - 可选增加 usage trace 日志
- `src/anthropic-bridge.ts`
  - `toAnthropicResponse(...)` 接入统一 usage
  - streaming 逻辑不再输出误导性的占位 0 usage
- `src/providers/cohere.ts`
  - 保持现有 provider 特例映射，但对齐统一 usage 层输入
- `src/types.ts`
  - 如有必要，补充共享 usage 类型；避免大范围类型重构

## Data flow

### OpenAI non-stream
1. 请求到 `/v1/chat/completions`
2. 路由到 provider
3. 读取 provider 返回的 JSON
4. 统一 usage 模块归一化 / 估算 usage
5. 返回带稳定 `usage` 的 OpenAI 响应

### Anthropic non-stream
1. 请求到 `/v1/messages`
2. Anthropic request 经 `fromAnthropicRequest(...)` 转成 OpenAI 风格请求
3. 路由到 provider
4. 统一 usage 模块归一化 / 估算 usage
5. `toAnthropicResponse(...)` 将 usage 映射为 `input_tokens/output_tokens`
6. 返回 Anthropic 风格响应

### Streaming
1. 保持现有主数据流与 SSE 转换逻辑
2. 不再输出固定 0 usage
3. 能在结束阶段拿到 usage 时再补；否则省略

## Error handling

本次改造的原则是：**usage 统一化不能影响主请求成功率**。

- 上游调用成功但 usage 缺失 → 非流式估算兜底
- 上游 usage 格式异常 → 忽略异常字段并回退到估算
- usage 归一化失败 → 不让整个请求报 500
- Streaming usage 无法可靠统计 → 省略，不伪造

只有真正的上游调用失败时，才按现有逻辑返回错误。

## Verification

### OpenAI non-stream
验证 `POST /v1/chat/completions`：

- 上游已有 usage 的 provider：返回 usage 且字段完整
- 上游无 usage 的 provider：返回估算 usage
- usage 字段始终包含：
  - `prompt_tokens`
  - `completion_tokens`
  - `total_tokens`

### Anthropic non-stream
验证 `POST /v1/messages`：

- 返回体始终包含：
  - `usage.input_tokens`
  - `usage.output_tokens`
- 有上游 usage 时优先映射
- 无上游 usage 时走估算兜底

### Streaming
验证 OpenAI / Anthropic stream：

- 不破坏现有 streaming 输出
- Anthropic stream 不再输出固定 0 usage
- usage 缺失时按保守策略省略

### Provider coverage
至少覆盖：

- `opencode`
- `openrouter`
- `cohere`
- 一个 usage 不稳定或缺失的 provider

## Out of scope

本次第一阶段明确不做：

- 新增 `count_tokens` 接口
- 引入真实 tokenizer 依赖
- 保证 provider 计费级别精确 usage
- 重构 provider 抽象层
- 新增新的公开 API surface
- 建立完整 streaming usage 统计闭环
- 单独处理 thinking / reasoning token 的专项统计

## Why this approach

这个方案的核心优势是：

- **最小改动**：不打散现有 server / bridge / provider 结构
- **统一方向正确**：不在多个接口各自打 usage 补丁，而是在网关层建立统一能力
- **利于后续扩展**：后续如果要补 `count_tokens`、更精确 tokenizer、更多 provider 特例，都可以继续建立在 `src/usage.ts` 之上
- **兼容风险低**：优先修复现有 usage 不稳定问题，不同时引入新的 API 复杂度
