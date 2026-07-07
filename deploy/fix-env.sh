#!/bin/bash
# Normalize legacy URLs in the production .env to the final domain.
cd /home/ubuntu/nextgenpay
sed -i 's|http://65.0.202.152|https://nxtgenpay.space|g; s|https://next-gen.space|https://nxtgenpay.space|g; s|https://api.next-gen.space|https://nxtgenpay.space|g' .env
grep -E 'APP_URL|NEXTAUTH_URL' .env
