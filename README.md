# Fiber DApp - AI Micropayment Demo

A demonstration DApp built on the Nervos CKB blockchain using **Fiber unidirectional payment channels**. Users connect to the merchant Fiber node directly via an in-browser WASM light node, enabling real-time, high-frequency off-chain micropayments on a per-chunk basis.

## Key Features

- **Fiber Unidirectional Payment Channels** — Off-chain micropayments based on the Spilman protocol
- **WASM Browser Node** — Private keys stay local; all payment signing happens client-side
- **AI Streaming Chunk Billing** — Every 20 tokens = 1 chunk (0.5 CKB), pay as you generate
- **Passkey Authentication** — Passwordless login via WebAuthn with public key signature verification
- **WebSocket Direct Connection** — Browser WASM node connects to merchant P2P port via WS proxy

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (WASM Fiber Node)                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Passkey  │  │ AI Chat UI   │  │ Payment Channel (sign/bill)│ │
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

## Project Structure

```
dapp_2_local/
├── packages/
│   ├── webapp/           # Next.js full-stack app (frontend + API + DB)
│   └── shared/           # Shared type definitions and utilities
├── merchant-node/        # Fiber merchant node (standalone deployment)
├── deploy/               # Production deployment configs (systemd + Caddy)
├── scripts/              # Root-level utility scripts
├── pnpm-workspace.yaml   # pnpm monorepo configuration
└── package.json          # Root-level script entries
```

### packages/webapp

Full-stack web application including the user interface, API services, and data management.

| Technology | Purpose |
|------------|---------|
| Next.js 15.5 (App Router) | Frontend framework + API Routes |
| Radix UI + Tailwind CSS 4.0 | UI component library |
| AI SDK + assistant-ui | AI chat integration |
| Zustand | Client-side state management |
| better-sqlite3 | Local database |
| @fiber-pay/sdk + fiber-js | Fiber payment protocol |
| node-cron | Scheduled auto-settlement |

### packages/shared

Shared TypeScript type definitions, CKB utilities, and deployment configurations used across packages.

### merchant-node

Standalone runtime environment for the Fiber merchant node, including the `fnn` binary, configuration files, and startup scripts. See [merchant-node/README.md](./merchant-node/README.md) for details.

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- [Ollama](https://ollama.ai/) (local AI model service)

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp packages/webapp/.env.example packages/webapp/.env.local
# Edit .env.local with required values (see Environment Variables below)

# 3. Start Ollama
ollama serve
ollama pull qwen2.5:0.5b

# 4. Start Merchant node (in another terminal)
cd merchant-node
./download-fnn.sh          # First time: download fnn binary
cp .env.example .env       # Configure environment variables
./start-merchant.sh        # Start the node
./start-ws-proxy.sh        # Start WS proxy

# 5. Start development server
pnpm dev                   # http://localhost:3000
```

### Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build all packages |
| `pnpm build:webapp` | Build webapp only |
| `pnpm lint` | Run ESLint |
| `pnpm prettier:fix` | Format code |
| `pnpm clear-tables` | Clear database tables |
| `pnpm cron-auto-settle` | Manually run auto-settlement |

## Environment Variables

### Webapp (`packages/webapp/.env.local`)

```bash
# AI model (local Ollama)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:0.5b

# Fiber merchant node (server-side calls)
FIBER_MERCHANT_RPC=http://127.0.0.1:8227

# Fiber config (client-side - MUST use NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_FIBER_MERCHANT_PUBKEY=0x...
NEXT_PUBLIC_FIBER_MERCHANT_MULTIADDR=/ip4/127.0.0.1/tcp/8228/ws
NEXT_PUBLIC_FIBER_NETWORK=testnet

# Authentication
JWT_SECRET=your-secret-key

# Proxy config (prevent local requests from being intercepted by global proxy)
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

> **Important**: Variables with `NEXT_PUBLIC_*` prefix are injected into the browser client. Variables without the prefix are only available server-side.

## Production Deployment

The project is deployed on a VPS via systemd services with Caddy as the reverse proxy.

### Service Architecture

| Service | Purpose | Port |
|---------|---------|------|
| `fiber-dapp-merchant` | Fiber merchant node | 8427 (RPC) / 8428 (P2P) |
| `fiber-dapp-ws-proxy` | WebSocket proxy | 18431 |
| `fiber-dapp-app` | Next.js application | 3100 |
| `fiber-dapp-cron` | Scheduled tasks (auto-settlement) | — |

### One-Click Deployment

```bash
cd deploy
chmod +x setup.sh
./setup.sh
```

`setup.sh` automatically handles: install dependencies → build project → download fnn → pull AI model → install and start systemd services.

### Caddy Reverse Proxy

- Automatic HTTPS certificates
- `/ws` path routed to WebSocket proxy
- COOP/COEP headers to enable SharedArrayBuffer (WASM multi-threading)

## Payment Flow

```
User sends message → AI streams response → Every 20 tokens = 1 chunk
                                                    ↓
                Frontend calculates amount → WASM node signs payment tx
                                                    ↓
                Server verifies signature → Stores tx → Updates balance panel
                                                    ↓
                Channel expires / user requests → node-cron settles on-chain
```

**Pricing**: 50,000,000 shannon (0.5 CKB) / chunk

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Local RPC requests fail | Set `NO_PROXY=localhost,127.0.0.1` |
| WASM node fails to load | Verify COOP/COEP headers are configured |
| Client can't read env vars | Use `NEXT_PUBLIC_` prefix |
| Merchant multiaddr connection fails | Address format: `/ip4/.../tcp/.../ws`, without `/p2p/` suffix |
| better-sqlite3 build fails | Run `pnpm rebuild better-sqlite3` |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend Framework | Next.js 15.5 + React 19 |
| UI | Radix UI + Tailwind CSS 4.0 |
| AI | Vercel AI SDK + assistant-ui |
| State Management | Zustand |
| Database | better-sqlite3 (SQLite) |
| Authentication | Passkey (WebAuthn) + JWT |
| Blockchain | CKB Testnet + Fiber v0.8.1 |
| Deployment | systemd + Caddy + websocat |

## License

Private
