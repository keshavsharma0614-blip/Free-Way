<p align="center">
  <img src="Assets/Head.png" alt="Freeway 封面" width="880" />
</p>

<h1 align="center">Freeway</h1>

<p align="center">
  一个面向免费模型生态的统一网关：兼容 OpenAI API，支持 Anthropic 协议桥接，
  内置控制台、健康检测、动态模型同步与本地配置持久化。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./CONTRIBUTING.md">Contributing (EN)</a> ·
  <a href="./contribution.md">贡献指南 (中文)</a>
</p>

## 项目简介

Freeway 是一个 TypeScript/Node.js 本地网关，目标是把多个免费 LLM Provider 统一在一个调用入口下，便于本地开发、代理聚合与调试验证。

核心能力：
- OpenAI 兼容接口：`/v1/chat/completions`、`/v1/models`
- Anthropic 兼容接口：`/v1/messages`
- Provider 健康状态检测（状态码、延迟、最近成功时间）
- 内置 Web 控制台（Providers / Models / API Keys / Test）
- 运行时密钥管理 + `.freeway/config.json` 持久化
- 模型列表缓存启动 + 后台同步刷新

## 功能亮点

- **统一路由，多 Provider 复用同一模型 ID**
  - 同名模型可在多个 Provider 间切换。
  - 支持通过 `provider/model` 强制指定 Provider，例如：`groq/llama-3.3-70b`。
- **可视化运维控制台**
  - 提供状态筛选、单 Provider 检测、全量检测、模型刷新、在线请求测试。
- **Anthropic 协议桥接**
  - 自动完成 Anthropic Messages 与 OpenAI 风格请求/响应的转换。
- **本地持久化配置**
  - 可通过 UI/API 保存密钥，重启后自动恢复。

## 已配置 Provider

当前在 `src/providers/index.ts` 内置：

`openrouter`、`groq`、`github`、`cloudflare`、`siliconflow`、`cerebras`、`mistral`、`cohere`、`nvidia`、`llm7`、`kilo`、`zhipu`、`opencode`

## 快速开始

### 1）环境要求

- Node.js 18+
- npm

### 2）安装并启动

```bash
npm install
npm run build
npm start
```

默认地址：`http://localhost:8787`

### 3）打开控制台

访问：

- `http://localhost:8787/`

在 **API Keys** 页面填写 Provider Key，或直接使用环境变量。

## 配置说明

### 密钥生效优先级

1. 运行时（通过 UI/API 设置）
2. 环境变量
3. 持久化文件 `.freeway/config.json`

### 常用环境变量

| 变量名 | 作用 |
|---|---|
| `FREEWAY_API_KEY` | 可选，网关访问鉴权 |
| `OPENROUTER_API_KEY` | OpenRouter 密钥 |
| `GROQ_API_KEY` | Groq 密钥 |
| `GITHUB_TOKEN` | GitHub Models Token |
| `CLOUDFLARE_API_KEY` | Cloudflare 密钥 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 模型同步所需账号 ID |
| `SILICONFLOW_API_KEY` | SiliconFlow 密钥 |
| `CEREBRAS_API_KEY` | Cerebras 密钥 |
| `MISTRAL_API_KEY` | Mistral 密钥 |
| `COHERE_API_KEY` | Cohere 密钥 |
| `NVIDIA_API_KEY` | NVIDIA NIM 密钥 |
| `LLM7_API_KEY` | LLM7 密钥 |
| `KILO_API_KEY` | Kilo 密钥 |
| `ZHIPU_API_KEY` | 智谱 BigModel 密钥 |
| `OPENCODE_API_KEY` | OpenCode 密钥 |
| `HTTP_PROXY` | 可选，统一出站 HTTP 代理 |

## API 调用示例

### OpenAI 兼容接口

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREEWAY_API_KEY" \
  -d '{
    "model": "llama-3.3-70b",
    "messages": [{"role": "user", "content": "请介绍一下 Freeway"}],
    "stream": false
  }'
```

### 指定 Provider 调用

```json
{
  "model": "groq/llama-3.3-70b"
}
```

### Anthropic 兼容接口

```bash
curl http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREEWAY_API_KEY" \
  -d '{
    "model": "llama-3.3-70b",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/` | Web 控制台 |
| `GET` | `/health` | 服务健康检查 |
| `GET` | `/api/catalog` | Provider/Model/Health 汇总 |
| `POST` | `/api/health/check/:provider` | 单 Provider 健康检测 |
| `POST` | `/api/health/check-all` | 全量 Provider 健康检测 |
| `POST` | `/api/models/refresh` | 刷新模型列表 |
| `POST` | `/api/config/keys` | 保存运行时与持久化密钥 |
| `GET` | `/v1/models` | OpenAI 兼容模型列表 |
| `POST` | `/v1/chat/completions` | OpenAI 兼容对话接口 |
| `POST` | `/v1/messages` | Anthropic 兼容对话接口 |

## 目录结构

```text
src/
  index.ts                # 启动入口
  server.ts               # HTTP 服务、路由与静态资源
  router.ts               # Provider 路由与失败重试
  providers/              # Provider 定义与模型同步编排
  models/                 # 模型注册、同步与缓存
  web/                    # 控制台前端
  config*.ts              # 运行时与持久化配置
  health.ts               # 健康检查与聚合
  anthropic-bridge.ts     # Anthropic 与 OpenAI 协议转换
```

## 开发命令

```bash
npm run dev     # TypeScript watch 编译
npm run build   # 编译到 dist/
npm start       # 启动服务
```

## 贡献

请阅读 [contribution.md](./contribution.md)。

## License

MIT