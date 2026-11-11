# Chagans PG Wallet Top-Up — Continuation Prompt

> Copy-paste this as the first message in a new chat to resume exactly where we left off.

---

## Context

We are integrating **Chagans Payment Gateway** for retailer wallet top-ups in NextGenPay. Chagans runs TWO gateways:

| Gateway | pgType | mode | MDR scope | Webhook IP |
|---------|--------|------|-----------|------------|
| **Comet** | `chagans3` | `t1` | `CHAGANS_COMET` | `34.126.212.125` |
| **Star** | `chagans2` | `t0` | `CHAGANS_STAR` | `103.160.106.129` |

**Both gateways are LIVE in production** and have successfully settled real money. The shared webhook endpoint is `POST /api/webhooks/chagans-pg` (IP-authenticated, webhook-only — Chagans has no status API).

## Tech Stack

- Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL (Supabase ap-south-1 Mumbai, `Decimal(14,2)` rupees).
- EC2: `/home/ubuntu/nextgenpay`, deploy via `bash ~/deploy.sh` or GitHub Actions auto-deploy on push to main. PM2 cluster (2 instances `next start -p 3000` + `nextgenpay-worker` fork).
- SSH: `ssh -i "C:\Users\hp\Desktop\nextgen.pem" ubuntu@65.0.202.152` (public) / `172.31.32.67` (internal).
- PowerShell shell on Windows → SSH to Ubuntu. Use `;` not `&&`, avoid `$()`, `()` in echo, `|` inside grep patterns (use multiple `-e` flags).
- Standing instruction: **"dont commit and push yourself"** — the owner deploys.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/partners/chagans-pg.ts` | Chagans adapter: gateway configs, `collect()`, `randomizeChagansAmount`, webhook IP validation, DUPLICATE_AMOUNT detection, health tracking |
| `src/lib/partners/index.ts` | Provider registry: `prepareAmount: gw.requiresRandom ? randomizeChagansAmount : (a) => a` |
| `src/lib/wallet/topup.ts` | `initiateTopup()`, `settleTopup()` (returns `{ refId, status, amount?, net? }`), `handleTopupCapture` (PG-MDR net-of-MDR settlement), money-safety (amount mismatch → HOLD) |
| `src/app/dashboard/wallet/page.tsx` | Retailer wallet UI: top-up form, channel selector, quote display, `checkTopup` resume-from-redirect poll, success modal (shows net credited + "Amount paid" row), `clearTopupParam` |
| `src/app/api/webhooks/chagans-pg/route.ts` | Webhook handler: IP-gated, parses Chagans payload, calls `settleTopup` with webhookVerified |
| `src/app/api/wallet/topup/route.ts` | POST = initiate, GET = poll status (calls `settleTopup`) |
| `src/app/pay/return/page.tsx` | Post-payment redirect page with `ReturnRedirect` component |
| `src/app/pay/return/ReturnRedirect.tsx` | No-op when framed (Star iframe); auto-forwards when not framed (Comet) |
| `src/components/dashboard/TransactionResult.tsx` | Success/pending modal with receipt download |
| `tests/partners-adapters.test.ts` | 52 tests including `randomizeChagansAmount` |

## Current Git State (Oct 23, 2026)

```
HEAD: 7abbbd7 "assigning scheme options updated"
Clean working tree (no uncommitted changes).
```

Recent PG commits (newest first):
```
7abbbd7 assigning scheme options updated
68af114 pg now working completely
7835d58 pg live now                          ← net-credited modal + ₹0 fix
d1409da commet pg amount message updated     ← exact amount (no paise nonce), DUPLICATE_AMOUNT detection
070dbc5 star pg redirection routes updated
3771696 star pg ip updated                   ← Star IP 103.160.106.129 corrected
860e9ed star pg redirection routes updated   ← same-tab redirect, ReturnRedirect iframe fix
```

## What's Working (Verified in Production)

### Comet (chagans3) ✅ FULLY LIVE
- payRequest → hosted page → payment → auto-webhook (from `34.126.212.125`) → net-of-MDR credit → success modal showing net credited.
- **Latest real production settle** (Oct 21): retailer "Rathod Rajdipbhai", ₹120 → net ₹117.72, MDR ₹2.28, UTR 629415083607.
- Duplicate-amount detection works: `"Amount already used, please try with a different amount"` → our code catches it via `m.includes("already")` → returns `DUPLICATE_AMOUNT` code → 409 → friendly "change your amount" message to the user. Proven Oct 21 (₹101 rejected, user changed to ₹120).
- Exact amount charged (no paise nonce). `requiresRandom` defaults to `false`, controllable via `CHAGAN_COMET_RANDOM` env.

### Star (chagans2) ✅ LIVE (with known gateway quirks)
- payRequest → hosted page → payment → auto-webhook (from `103.160.106.129`) → net-of-MDR credit → success modal.
- **First successful Star settle** (Oct 14): ₹19 → net ₹18.70, MDR ₹0.30, UTR 628711090614 (auto-webhook, real card).
- Star renders payment inside a chagans.com iframe; our `ReturnRedirect` is a no-op when framed, relying on the user's `target="_top"` "Go to my wallet" button click.
- `requiresRandom` defaults to `false`, controllable via `CHAGAN_STAR_RANDOM` env.

### All 5 Production Settlements
| Date | Ref | OrderId | Gross | Net | MDR | UTR | Gateway |
|------|-----|---------|-------|-----|-----|-----|---------|
| Oct 8 | TOPUP5LCI88ZJRVSZ | CPG_ABE27B901198A2B4 | 100.54 | 98.63 | 1.91 | 628116030860 | Comet (nonce era) |
| Oct 12 | TOPUPA6OD1I9T2PF7 | CPG_C08E79F2A592EC56 | 102.87 | 100.92 | 1.95 | 628517052175 | Comet (nonce era) |
| Oct 14 | TOPUPFJV13PEF8830 | CPG_FF1DE3D0741876E3 | 108 | 105.95 | 2.05 | 628709000483 | Comet (exact amt) |
| Oct 14 | TOPUP1YWL1T19XX0G | CPG_E98185C20D10FC6D | 19 | 18.70 | 0.30 | 628711090614 | Star |
| Oct 21 | TOPUPJ3O50RCXTB3M | CPG_A25700798498A25B | 120 | 117.72 | 2.28 | 629415083607 | Comet |

## Known Issues / Remaining Work

### 1. 🔴 Star rejects amounts that are multiples of 100 (NEW — discovered Oct 21)
**Evidence from server logs:**
```
Star payRequest ₹39,000 → 400 "Invalid amount, amount should not be multiple of 100"
Star payRequest ₹39,100 → 400 "Invalid amount, amount should not be multiple of 100"
Star payRequest ₹39,109 → 200 OK (accepted)
```
**Action needed:** Detect this rejection in `collect()` and return a clear user-facing message ("Star PG does not accept amounts that are exact multiples of ₹100 — please change your amount by at least ₹1") OR add client-side validation blocking multiples of 100 when Star is selected. Decide: should we silently add ₹1 for multiples of 100 (product question — owner previously rejected silent amount changes), or show a message?

### 2. 🟡 Comet duplicate-amount rejection — user message surfacing
The DUPLICATE_AMOUNT detection is coded and deployed. The error message "Amount already used, please try with a different amount" gets matched by `m.includes("already")` → returns friendly "This amount was just used on this gateway. Please change the amount (even by ₹1) and try again." via a 409. **Verify this message actually displayed correctly to the retailer** who hit it on Oct 21 (no screenshot captured).

### 3. 🟡 Uncredited Star test orders from Oct 14 (manual reconciliation)
These were paid during integration testing but Star's webhook wasn't working at the time:
- `CPG_4D9E5ACA357F6E50` — ₹104 (Oct 12, Manish RT)
- `CPG_A9D806CC55A3ABBF` — ₹105 (Oct 14, HELD — Vineet's Postman sent sample ₹1000)
- `CPG_341DFEF2F5B86CAB` — ₹109 (Oct 14, Manish RT)
- `CPG_DD14BE87A0A36DAF` — ₹124 (Oct 14, Manish RT)
- `CPG_0CD0BC664C4D66CF` — ₹12 (Oct 14, Manish RT)

**Action:** Confirm with Chagans which were actually captured, then manually credit via settleTopup with webhookVerified or a direct wallet adjustment.

### 4. 🟡 Phase 2: Admin PG page wired to real PgSettlementEntry data (IN_PROGRESS from original todo)
The admin PG dashboard was started but not finished. Needs to show real settlement entries from the `PgSettlementEntry` table.

### 5. 🟡 Phase 3: Retailer wallet UI redesign + live quote endpoint (PENDING from original todo)
The live quote endpoint (`/api/wallet/topup/quote`) exists and works. The UI shows the quote (gross/MDR/net) before submitting. This phase covers any remaining UI polish.

### 6. 🟢 Final: tsc + eslint + vitest green; seed routes; commit; deploy (PENDING from original todo)
All tests currently pass (316/316). Seed PG config routes at deploy time.

## Server Environment

- **Webhook IPs** (env override): `CHAGAN_WEBHOOK_IPS="103.160.106.129,103.160.160.129,34.126.212.125"` in both `.env` and `~/env-nextgenpay`.
- **DEFAULT_WEBHOOK_IPS** in code: `"103.160.106.129,103.160.160.129,34.126.212.125"` (committed).
- `CHAGAN_COMET_RANDOM` / `CHAGAN_STAR_RANDOM` not set → both default to `false` (exact amounts).
- Chagans LIVE credentials are on the server (env). Do NOT rotate keys.

## Security Constraints
- Mask secrets in output, delete temp files.
- Do NOT commit/push yourself — owner deploys.
- Ignore the old ₹100.31 order (refId TOPUPERKP48PW2G62, orderId CPG_9E2ECB4157DD74E3) — owner tested fresh.

## How to Check Logs
```bash
# SSH in
ssh -i "C:\Users\hp\Desktop\nextgen.pem" ubuntu@65.0.202.152

# Live tail Chagans events
tail -F /home/ubuntu/logs/nextgenpay-out.log | grep --line-buffered -e chagans.payrequest -e chagans_pg_received -e topup_settled -e mismatch -e rejected_ip

# Check specific order
grep -h "CPG_XXXX" /home/ubuntu/logs/nextgenpay-out.log

# Check nginx for webhook POSTs
sudo grep "chagans-pg" /var/log/nginx/access.log | tail -n 20
```

## Immediate Priority
**Fix the Star "multiples of 100" rejection** — this is blocking real retailers (Rathod Rajdipbhai hit it Oct 21 with ₹39,000). Then reconcile the uncredited Star test orders. Then continue with Phase 2 (admin PG dashboard).
