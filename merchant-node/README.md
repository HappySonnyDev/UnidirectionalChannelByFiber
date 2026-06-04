# Fiber 商家节点

Fiber 商家节点，用于接收 AI 助手服务的支付。浏览器端 WASM 轻节点通过 WebSocket 代理与商家节点直连，建立单向支付通道。

## 架构说明

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器端                               │
│                  ┌──────────────────┐                        │
│                  │  User Node       │  ← Passkey (WebAuthn)  │
│                  │  (WASM Browser)  │                        │
│                  └────────┬─────────┘                        │
└───────────────────────────┼──────────────────────────────────┘
                            │ WebSocket
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   WebSocket Proxy                            │
│                 (websocat ws→tcp)                            │
│                  ┌──────────────────┐                        │
│                  │  ws-proxy        │  端口 8231             │
│                  └────────┬─────────┘                        │
└───────────────────────────┼──────────────────────────────────┘
                            │ TCP
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Merchant Node                             │
│                  ┌──────────────────┐                        │
│                  │  Fiber Merchant  │  ← 传统私钥             │
│                  │  (fnn binary)    │                        │
│                  └──────────────────┘                        │
│  P2P: 0.0.0.0:8228    RPC: 127.0.0.1:8227                  │
│  CKB Testnet: https://testnet.ckbapp.dev/                   │
└──────────────────────────────────────────────────────────────┘
```

> 与 Router + Station 多跳架构不同，本项目采用 **单向直连通道**：浏览器 WASM 节点直接与商家节点建立通道，无需 Router 中转。

## 快速开始

### 1. 下载 fnn 二进制

```bash
# 自动下载（推荐）
./download-fnn.sh

# 指定版本
./download-fnn.sh v0.4.1

# 或手动下载: https://github.com/nervosnetwork/fiber/releases
```

### 2. 生成私钥并配置环境变量

```bash
# 生成商家节点私钥
openssl rand -hex 32

# 复制环境变量模板并填入私钥
cp .env.example .env
# 编辑 .env，将生成的私钥填入 MERCHANT_PRIVATE_KEY
```

### 3. 启动商家节点

```bash
./start-merchant.sh
```

节点启动后会打印：
- P2P 监听地址和公钥
- CKB 地址（用于接收测试币）

### 4. 充值测试币

1. 从节点日志或 RPC 获取 CKB 地址
2. 前往 https://faucet.nervos.org/ 领取测试币
3. 至少需要 **200 CKB** 来建立通道

### 5. 启动 WebSocket 代理（浏览器节点需要）

```bash
# 需要先安装 websocat
# macOS: brew install websocat
# Linux: cargo install websocat

./start-ws-proxy.sh
```

代理启动后，将输出的 `VITE_FIBER_BOOTNODE` 配置到 webapp 的 `.env` 中。

### 6. 检查通道状态

```bash
./setup-channel.sh
```

## 配置文件说明

### 环境变量 (.env)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MERCHANT_PRIVATE_KEY` | 商家节点私钥（必填） | - |
| `MERCHANT_NODE_NAME` | 节点名称 | MerchantNode |
| `CKB_RPC_URL` | CKB 测试网 RPC | https://testnet.ckbapp.dev/ |
| `FIBER_P2P_PORT` | P2P 监听端口 | 8228 |
| `FIBER_RPC_PORT` | JSON-RPC 端口 | 8227 |
| `WS_PROXY_LISTEN` | WebSocket 代理监听地址 | 0.0.0.0:8231 |
| `WS_PROXY_TARGET` | WebSocket 代理目标地址 | 127.0.0.1:8228 |

### 节点配置 (config/merchant.yml)

YAML 格式的 Fiber 节点配置，包含：
- **fiber**: P2P 监听地址、节点名称、链类型（testnet）、脚本配置
- **rpc**: JSON-RPC 监听地址
- **ckb**: CKB 节点 RPC 地址
- **services**: 启用的服务列表

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `download-fnn.sh` | 从 GitHub Releases 下载 fnn 二进制（自动探测平台） |
| `start-merchant.sh` | 启动商家节点（含环境检查） |
| `start-ws-proxy.sh` | 启动 WebSocket→TCP 代理（供浏览器 WASM 节点连接） |
| `setup-channel.sh` | 检查节点状态和通道信息 |

## 常用 RPC 命令

```bash
# 查看节点信息
curl http://127.0.0.1:8227 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"node_info","params":[],"id":1}'

# 列出所有通道
curl http://127.0.0.1:8227 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"list_channels","params":[],"id":1}'

# 查看余额
curl http://127.0.0.1:8227 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"get_balance","params":[],"id":1}'
```

## 故障排除

### fnn 启动失败：私钥未设置

```
Error: MERCHANT_PRIVATE_KEY not set in .env file
```

确保已执行 `cp .env.example .env` 并填入了私钥。

### 浏览器节点无法连接

1. 确认商家节点已启动：`curl http://127.0.0.1:8227`
2. 确认 WebSocket 代理已启动：`./start-ws-proxy.sh`
3. 确认 webapp 的 `VITE_FIBER_BOOTNODE` 配置正确

### 通道建立失败

- 确认商家节点已充值足够 CKB（至少 200 CKB）
- 确认使用的是 CKB 测试网（testnet）
- 检查 `config/merchant.yml` 中的脚本配置是否正确

### websocat 未安装

```bash
# macOS
brew install websocat

# Linux
cargo install websocat

# 或从 GitHub Releases 下载
# https://github.com/vi/websocat/releases
```

## 目录结构

```
merchant-node/
├── config/
│   └── merchant.yml       # 商家节点 YAML 配置
├── data/                  # 运行时数据（gitignored）
├── fnn                    # Fiber 节点二进制（需下载）
├── fnn-cli                # Fiber CLI 工具（需下载）
├── .env.example           # 环境变量模板
├── .gitignore
├── download-fnn.sh        # 下载 fnn 二进制
├── start-merchant.sh      # 启动商家节点
├── start-ws-proxy.sh      # 启动 WebSocket 代理
├── setup-channel.sh       # 检查通道状态
└── README.md
```
