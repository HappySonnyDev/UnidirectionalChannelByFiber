# Fiber DApp - AI Micropayment Demo

基于 Nervos CKB 区块链 **Fiber 单向支付通道**的 AI 对话微支付演示应用。用户通过浏览器内 WASM 轻节点与商家 Fiber 节点直连，实现按数据块（chunk）实时、高频的链下微支付。

## 核心特性

- **Fiber 单向支付通道** — 基于 Spilman 协议的链下微支付
- **WASM 浏览器节点** — 用户私钥仅存本地，支付签名全部在客户端完成
- **AI 流式分块计费** — 每 20 token 为 1 chunk（0.5 CKB），边生成边付费
- **Passkey 认证** — WebAuthn 无密码登录，公钥签名验证身份
- **WebSocket 直连** — 浏览器 WASM 节点通过 WS 代理直连商家 P2P 端口

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (WASM Fiber Node)                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Passkey  │  │ AI Chat UI   │  │ Payment Channel (签名/计费)│ │
│  └──────────┘  └──────────────┘  └───────────────────────────┘ │
└──────────┬──────────────┬────────────────────┬──────────────────┘
           │ HTTPS        │ HTTPS              │ WebSocket
           ▼              ▼                    ▼
┌──────────────────────────────────┐   ┌──────────────────┐
│  Next.js App (Port 3100)         │   │  WS Proxy        │
│  ┌────────┐ ┌──────┐ ┌───────┐  │   │  (Port 18431)    │
│  │ Auth   │ │ Chat │ │Invoice│  │   └────────┬─────────┘
│  │ API    │ │ API  │ │ API   │  │            │ TCP
│  └────────┘ └──────┘ └───────┘  │            ▼
│  ┌─────────────────────────────┐ │   ┌──────────────────┐
│  │  SQLite  │  node-cron       │ │   │  Merchant Node   │
│  └─────────────────────────────┘ │   │  (fnn binary)    │
└──────────────────────────────────┘   │  RPC: 8427       │
                                       │  P2P:  8428      │
                                       └────────┬─────────┘
                                                │
                                                ▼
                                       ┌──────────────────┐
                                       │  CKB Testnet     │
                                       └──────────────────┘
```

## 项目结构

```
dapp_2_local/
├── packages/
│   ├── webapp/           # Next.js 全栈应用（前端 + API + DB）
│   └── shared/           # 跨包共享的类型定义与工具函数
├── merchant-node/        # Fiber 商家节点（独立部署）
├── deploy/               # 生产部署配置（systemd + Caddy）
├── scripts/              # 根级工具脚本
├── pnpm-workspace.yaml   # pnpm Monorepo 配置
└── package.json          # 根级脚本入口
```

### packages/webapp

全栈 Web 应用，包含用户界面、API 服务和数据管理。

| 技术 | 用途 |
|------|------|
| Next.js 15.5 (App Router) | 前端框架 + API Routes |
| Radix UI + Tailwind CSS 4.0 | UI 组件库 |
| AI SDK + assistant-ui | AI 聊天集成 |
| Zustand | 客户端状态管理 |
| better-sqlite3 | 本地数据库 |
| @fiber-pay/sdk + fiber-js | Fiber 支付协议 |
| node-cron | 定时自动结算 |

### packages/shared

跨包共享的 TypeScript 类型定义、CKB 工具函数和部署配置。

### merchant-node

Fiber 商家节点的独立运行环境，包含 `fnn` 二进制、配置文件和启动脚本。详见 [merchant-node/README.md](./merchant-node/README.md)。

## 快速开始

### 前置要求

- Node.js 22+
- pnpm 10+
- [Ollama](https://ollama.ai/)（本地 AI 模型服务）

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp packages/webapp/.env.example packages/webapp/.env.local
# 编辑 .env.local 填入必要配置（见下方环境变量说明）

# 3. 启动 Ollama
ollama serve
ollama pull qwen2.5:0.5b

# 4. 启动 Merchant 节点（另一个终端）
cd merchant-node
./download-fnn.sh          # 首次：下载 fnn 二进制
cp .env.example .env       # 配置环境变量
./start-merchant.sh        # 启动节点
./start-ws-proxy.sh        # 启动 WS 代理

# 5. 启动开发服务器
pnpm dev                   # http://localhost:3000
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建所有包 |
| `pnpm build:webapp` | 仅构建 webapp |
| `pnpm lint` | ESLint 检查 |
| `pnpm prettier:fix` | 代码格式化 |
| `pnpm clear-tables` | 清空数据库 |
| `pnpm cron-auto-settle` | 手动执行自动结算 |

## 环境变量

### Webapp (`packages/webapp/.env.local`)

```bash
# AI 模型（Ollama 本地）
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:0.5b

# Fiber 商家节点（服务端调用）
FIBER_MERCHANT_RPC=http://127.0.0.1:8227

# Fiber 配置（客户端 - 必须使用 NEXT_PUBLIC_ 前缀）
NEXT_PUBLIC_FIBER_MERCHANT_PUBKEY=0x...
NEXT_PUBLIC_FIBER_MERCHANT_MULTIADDR=/ip4/127.0.0.1/tcp/8228/ws
NEXT_PUBLIC_FIBER_NETWORK=testnet

# 认证
JWT_SECRET=your-secret-key

# 代理配置（防止本地请求被全局代理拦截）
NO_PROXY=localhost,127.0.0.1
```

### Merchant Node (`merchant-node/.env`)

```bash
MERCHANT_PRIVATE_KEY=<64-char-hex>
CKB_RPC_URL=https://testnet.ckbapp.dev/
FIBER_P2P_PORT=8428
FIBER_RPC_PORT=8427
FIBER_WS_PORT=8431
```

> **重要**: `NEXT_PUBLIC_*` 前缀的变量会注入到浏览器客户端，不带前缀的变量仅在服务端可用。

## 生产部署

项目通过 systemd 服务部署在 VPS 上，使用 Caddy 作为反向代理。

### 服务架构

| 服务 | 用途 | 端口 |
|------|------|------|
| `fiber-dapp-merchant` | Fiber 商家节点 | 8427 (RPC) / 8428 (P2P) |
| `fiber-dapp-ws-proxy` | WebSocket 代理 | 18431 |
| `fiber-dapp-app` | Next.js 应用 | 3100 |
| `fiber-dapp-cron` | 定时任务（自动结算） | — |

### 一键部署

```bash
# 在 VPS 上执行
cd deploy
chmod +x setup.sh
./setup.sh
```

`setup.sh` 会自动完成：安装依赖 → 构建项目 → 下载 fnn → 拉取 AI 模型 → 安装并启动 systemd 服务。

### Caddy 反向代理

- HTTPS 自动证书
- `/ws` 路径路由至 WebSocket 代理
- COOP/COEP headers 启用 SharedArrayBuffer（WASM 多线程）

## 支付流程

```
用户发送消息 → AI 流式响应 → 每 20 token = 1 chunk
                                      ↓
              前端计算金额 → WASM 节点签署支付交易
                                      ↓
              服务端验证签名 → 存储交易 → 更新余额面板
                                      ↓
              通道到期/用户请求 → node-cron 自动结算上链
```

**定价**: 50,000,000 shannon (0.5 CKB) / chunk

## 常见问题

| 问题 | 解决方案 |
|------|---------|
| 本地 RPC 请求失败 | 设置 `NO_PROXY=localhost,127.0.0.1` |
| WASM 节点无法加载 | 确认 COOP/COEP headers 已配置 |
| 客户端读不到环境变量 | 使用 `NEXT_PUBLIC_` 前缀 |
| Merchant multiaddr 连接失败 | 地址格式为 `/ip4/.../tcp/.../ws`，不含 `/p2p/` 后缀 |
| better-sqlite3 编译失败 | 运行 `pnpm rebuild better-sqlite3` |

## 技术栈总览

| 层级 | 选型 |
|------|------|
| 前端框架 | Next.js 15.5 + React 19 |
| UI | Radix UI + Tailwind CSS 4.0 |
| AI | Vercel AI SDK + assistant-ui |
| 状态管理 | Zustand |
| 数据库 | better-sqlite3 (SQLite) |
| 认证 | Passkey (WebAuthn) + JWT |
| 区块链 | CKB Testnet + Fiber v0.8.1 |
| 部署 | systemd + Caddy + websocat |

## License

Private
