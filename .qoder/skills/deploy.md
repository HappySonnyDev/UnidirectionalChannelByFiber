# Fiber DApp — Deployment & Maintenance

## Environment Constants

| Item | Value |
|------|-------|
| Local code | /Users/sonny/dapp_2_local |
| VPS IP | 54.180.28.237 |
| SSH alias | fiber-demo (configured in local ~/.ssh/config) |
| Domain | dapp.54-180-28-237.sslip.io |
| Project path | /opt/fiber-dapp |
| Repo | https://github.com/HappySonnyDev/UnidirectionalChannelByFiber.git |
| Merchant node path | /opt/fiber-dapp/merchant-node |
| Next.js port | 3100 (loopback, Caddy reverse-proxies from 443) |
| WebSocket port | 8431 (Caddy → websocat loopback 18431) |
| Fiber RPC port | 8427 |
| Fiber P2P port | 8428 |
| Ollama port | 11434 |
| User on VPS | ubuntu (files owned by root, use sudo) |

## Systemd Services

| Service | Purpose |
|---------|---------|
| fiber-dapp-app | Next.js frontend + API |
| fiber-dapp-merchant | Fiber merchant node |
| fiber-dapp-ws-proxy | websocat WebSocket → TCP proxy |
| fiber-dapp-cron | Cron scheduler (auto-settle) |

## Quick Actions

### Pull latest code + rebuild frontend

```bash
ssh fiber-demo "cd /opt/fiber-dapp \
  && sudo git config --global --add safe.directory /opt/fiber-dapp \
  && sudo git pull origin main \
  && sudo systemctl stop fiber-dapp-app \
  && sudo pnpm install \
  && sudo pnpm build \
  && sudo systemctl start fiber-dapp-app"
```

### Check all service statuses

```bash
ssh fiber-demo "systemctl status fiber-dapp-app fiber-dapp-merchant fiber-dapp-ws-proxy fiber-dapp-cron --no-pager"
```

### View frontend logs

```bash
ssh fiber-demo "journalctl -u fiber-dapp-app -f -n 50"
```

### View merchant node logs

```bash
ssh fiber-demo "journalctl -u fiber-dapp-merchant -f -n 50"
```

### View WebSocket proxy logs

```bash
ssh fiber-demo "journalctl -u fiber-dapp-ws-proxy -f -n 50"
```

### Restart all services

```bash
ssh fiber-demo "sudo systemctl restart fiber-dapp-merchant fiber-dapp-ws-proxy fiber-dapp-app fiber-dapp-cron"
```

### Restart only the frontend

```bash
ssh fiber-demo "sudo systemctl restart fiber-dapp-app"
```

### Get merchant node info (pubkey)

```bash
ssh fiber-demo "curl -s -X POST http://127.0.0.1:8427 -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"node_info\",\"params\":[],\"id\":1}' | jq"
```

### List merchant channels

```bash
ssh fiber-demo "cd /opt/fiber-dapp/merchant-node && ./fnn-cli -u http://127.0.0.1:8427 channel list_channels"
```

## Key Files on VPS

| File | Purpose |
|------|---------|
| /opt/fiber-dapp/packages/webapp/.env | Frontend + API env vars |
| /opt/fiber-dapp/merchant-node/.env | Merchant node keys & config |
| /opt/fiber-dapp/merchant-node/config/merchant.yml | Fiber node config |
| /opt/fiber-dapp/deploy/Caddyfile | Caddy reverse-proxy config |
| /opt/fiber-dapp/deploy/setup.sh | One-shot bootstrap script |
| /etc/caddy/Caddyfile.d/fiber-dapp | Live Caddy config |

## Initial Setup (First Deploy)

```bash
# 1. Clone repo on VPS
ssh fiber-demo "sudo git clone https://github.com/HappySonnyDev/UnidirectionalChannelByFiber.git /opt/fiber-dapp"

# 2. Configure environment variables
ssh fiber-demo "sudo nano /opt/fiber-dapp/packages/webapp/.env"
ssh fiber-demo "sudo nano /opt/fiber-dapp/merchant-node/.env"

# 3. Run setup script
ssh fiber-demo "cd /opt/fiber-dapp && sudo bash deploy/setup.sh"

# 4. Get merchant pubkey and update webapp .env
ssh fiber-demo "curl -s -X POST http://127.0.0.1:8427 -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"node_info\",\"params\":[],\"id\":1}' | jq '.result.node_id'"
```

## Troubleshooting

### SharedArrayBuffer not available
Caddy sets COOP: same-origin + COEP: require-corp headers. Ensure no external resources (Google Fonts, CDN scripts) are loaded without CORP headers. The project uses next/font/google for local font hosting.

### Frontend 502 error
1. Check if Next.js is running: `ssh fiber-demo "curl -I http://127.0.0.1:3100/"`
2. Check Caddy logs: `ssh fiber-demo "journalctl -u caddy -n 20"`
3. Check app logs: `ssh fiber-demo "journalctl -u fiber-dapp-app -n 50"`

### Merchant node not responding
1. Check status: `ssh fiber-demo "systemctl status fiber-dapp-merchant"`
2. Check if RPC is listening: `ssh fiber-demo "curl -s http://127.0.0.1:8427"`
3. Check logs: `ssh fiber-demo "journalctl -u fiber-dapp-merchant -n 50"`

### WebSocket connection failed
1. Check ws-proxy: `ssh fiber-demo "systemctl status fiber-dapp-ws-proxy"`
2. Verify merchant P2P port: `ssh fiber-demo "ss -tlnp | grep 8428"`
3. Test WebSocket: Check browser console for connection errors

### Port conflicts with charge project
This project uses ports 3100/8427/8428/8431/18431 to avoid conflicts with charge project (3000/8227/8228/8231/18231).
