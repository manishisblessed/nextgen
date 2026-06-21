#!/bin/bash
cd /home/ubuntu/nextgenpay
sed -i 's|EMAIL_FROM="onboarding@resend.dev"|EMAIL_FROM="jmpnextgenpay@gmail.com"|' .env
grep EMAIL_FROM .env
