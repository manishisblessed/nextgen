#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "  NextGenPay — Redeploy"
echo "=========================================="

cd /home/ubuntu/nextgenpay

echo "[1/5] Pulling latest code..."
git pull origin main

echo "[2/5] Installing dependencies..."
npm ci --production=false

echo "[3/5] Generating Prisma client..."
npx prisma generate

echo "[4/5] Applying database migrations..."
npx prisma migrate deploy

echo "[5/5] Building and restarting..."
npm run build
pm2 restart ecosystem.config.js
pm2 save

echo ""
echo "=========================================="
echo "  Redeploy complete!"
echo "  Run 'pm2 status' to verify."
echo "=========================================="
