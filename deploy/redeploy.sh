#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "  NextGenPay — Redeploy"
echo "=========================================="

cd /home/ubuntu/nextgenpay

echo "[1/6] Pulling latest code..."
git pull origin main

echo "[2/6] Validating .env (drift check)..."
bash deploy/check-env.sh .env

echo "[3/6] Installing dependencies..."
npm ci --production=false

echo "[4/6] Generating Prisma client..."
npx prisma generate

echo "[5/6] Applying database migrations..."
npx prisma migrate deploy

echo "[6/6] Building and restarting..."
npm run build
# --update-env ensures all cluster workers pick up new env vars
pm2 restart ecosystem.config.js --update-env
pm2 save

echo ""
echo "=========================================="
echo "  Redeploy complete!"
echo "  Run 'pm2 status' to verify."
echo "=========================================="
