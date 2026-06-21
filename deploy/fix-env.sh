#!/bin/bash
cd /home/ubuntu/nextgenpay
sed -i 's|http://65.0.202.152|https://api.next-gen.space|g' .env
grep -E 'APP_URL|NEXTAUTH_URL' .env
