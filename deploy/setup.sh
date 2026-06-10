#!/bin/bash
set -e
cd /opt/fiber-dapp

# 安装依赖
pnpm install

# 构建
pnpm build

# 下载 fnn 二进制（如未存在）
cd merchant-node && bash download-fnn.sh && cd ..

# 拉取 Ollama 模型
ollama pull qwen2.5:0.5b

# 安装 systemd 服务
sudo cp deploy/fiber-dapp-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fiber-dapp-merchant fiber-dapp-ws-proxy fiber-dapp-app fiber-dapp-cron

# 更新 Caddy 配置
sudo mkdir -p /etc/caddy/Caddyfile.d
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile.d/fiber-dapp
sudo systemctl reload caddy

# 启动服务
sudo systemctl start fiber-dapp-merchant
sleep 5
sudo systemctl start fiber-dapp-ws-proxy
sudo systemctl start fiber-dapp-app
sudo systemctl start fiber-dapp-cron

echo "All services started successfully!"
echo "Check status: systemctl status fiber-dapp-app fiber-dapp-merchant fiber-dapp-ws-proxy fiber-dapp-cron"
