#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "  NextGenPay EC2 Setup — Ubuntu 26.04"
echo "=========================================="

# 1. System updates
echo "[1/7] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20 LTS via NodeSource
echo "[2/7] Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

# 3. Install PM2 globally
echo "[3/7] Installing PM2..."
sudo npm install -g pm2

# 4. Install Nginx
echo "[4/7] Installing Nginx..."
sudo apt install -y nginx
sudo systemctl enable nginx

# 5. Create app directory and logs
echo "[5/7] Setting up directories..."
mkdir -p /home/ubuntu/nextgenpay
mkdir -p /home/ubuntu/logs

# 6. Clone the repo
echo "[6/7] Cloning repository..."
if [ -d "/home/ubuntu/nextgenpay/.git" ]; then
    echo "Repo already exists, pulling latest..."
    cd /home/ubuntu/nextgenpay && git pull origin main
else
    git clone https://github.com/manishisblessed/nextgen.git /home/ubuntu/nextgenpay
fi

# 7. Install dependencies
echo "[7/7] Installing npm dependencies..."
cd /home/ubuntu/nextgenpay
npm ci --production=false

echo ""
echo "=========================================="
echo "  Base setup complete!"
echo "  Next steps:"
echo "  1. Create .env.production"
echo "  2. Run: npx prisma generate"
echo "  3. Run: npx prisma migrate deploy"
echo "  4. Run: npm run build"
echo "  5. Configure Nginx"
echo "  6. Start PM2"
echo "=========================================="
