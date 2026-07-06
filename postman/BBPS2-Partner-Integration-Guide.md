# BBPS-2 (Pay2New) Credit Card Bill Payment — Partner Integration Guide

## Quick Start

**Base URL:** `https://api.samedaysolution.in`  
**Auth:** HMAC-SHA256 signature on every request  
**Flow:** Get Billers → Fetch Bill → Check Charges → Pay Bill → Check Status

---

## Authentication

Every request requires 3 headers:

| Header | Value |
|--------|-------|
| `x-api-key` | Your API key (from admin panel) |
| `x-signature` | HMAC-SHA256 signature (see below) |
| `x-timestamp` | Current Unix timestamp in **milliseconds** |

### Signature Generation

**GET requests:**
```
signature = HMAC-SHA256(api_secret, "" + timestamp)
```

**POST requests:**
```
signature = HMAC-SHA256(api_secret, JSON.stringify(bodyObject) + timestamp)
```

> **CRITICAL:** You must sign the **compact/minified** JSON (`JSON.stringify(object)` — no spaces, no newlines). The server parses and re-serializes your body before validating the signature. If you sign formatted JSON, it will fail.

### Node.js Example

```javascript
const crypto = require('crypto');

function makeRequest(method, url, bodyObject, apiKey, apiSecret) {
  const timestamp = Date.now().toString();
  
  let bodyString = '';
  if (method === 'POST' && bodyObject) {
    bodyString = JSON.stringify(bodyObject); // compact JSON — use SAME string as request body
  }
  
  const payload = bodyString + timestamp;
  const signature = crypto.createHmac('sha256', apiSecret).update(payload).digest('hex');
  
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-signature': signature,
      'x-timestamp': timestamp,
    },
    body: method === 'POST' ? bodyString : undefined,
  });
}
```

### Python Example

```python
import hmac, hashlib, json, time, requests

def make_request(method, url, body_object, api_key, api_secret):
    timestamp = str(int(time.time() * 1000))
    
    body_string = ''
    if method == 'POST' and body_object:
        body_string = json.dumps(body_object, separators=(',', ':'))  # compact JSON
    
    payload = body_string + timestamp
    signature = hmac.new(api_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'x-signature': signature,
        'x-timestamp': timestamp,
    }
    
    if method == 'POST':
        return requests.post(url, data=body_string, headers=headers)
    return requests.get(url, headers=headers)
```

### PHP Example

```php
function makeRequest($method, $url, $bodyObject, $apiKey, $apiSecret) {
    $timestamp = (string)(int)(microtime(true) * 1000);
    
    $bodyString = '';
    if ($method === 'POST' && $bodyObject) {
        $bodyString = json_encode($bodyObject); // compact JSON
    }
    
    $payload = $bodyString . $timestamp;
    $signature = hash_hmac('sha256', $payload, $apiSecret);
    
    $headers = [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'x-signature: ' . $signature,
        'x-timestamp: ' . $timestamp,
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyString);
    }
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}
```

---

## API Endpoints

### 1. Get Billers

```
GET /api/partner/pay2new/billers
```

No request body. Returns list of available credit card billers.

**Response:**
```json
{
  "success": true,
  "service_id": 34,
  "billers": [
    { "product_code": "ICICI_CREDIT_CARD", "product_name": "ICICI CREDIT CARD", "service_id": "34" },
    { "product_code": "HDFC_CREDIT_CARD", "product_name": "HDFC CREDIT CARD", "service_id": "34" }
  ],
  "count": 38
}
```

Save the `product_code` of the biller your customer selects.

---

### 2. Fetch Bill

```
POST /api/partner/pay2new/bill/fetch
```

**Request:**
```json
{
  "number": "5008",
  "product_code": "ICICI_CREDIT_CARD",
  "customer_number": "9971969046",
  "optional1": "9971969046",
  "optional2": "",
  "optional3": "",
  "optional4": "",
  "pincode": "414002"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `number` | Yes | **Last 4 digits** of the credit card (NOT full number) |
| `product_code` | Yes | From Get Billers |
| `customer_number` | Yes | Mobile number registered with the card |
| `optional1` | **Yes** | Same mobile number (mandatory for CC billers) |
| `optional2`-`optional4` | No | Biller-specific fields |
| `pincode` | No | Customer pincode (default: "414002") |

**Response:**
```json
{
  "success": true,
  "data": {
    "customer_name": "MANISH KUMAR SHAH",
    "amount": "15234.00",
    "bill_date": "2026-06-15",
    "bill_due_date": "2026-07-05",
    "bill_number": "INV-2026-06-001",
    "Minimum Amount Due": "1523.00",
    "Maximum Permissible Amount": "50000.00"
  },
  "order_id": "P2N_ORD_1234567890",
  "request_id": "SDS1719720000000"
}
```

**SAVE `order_id`** — you need it as `bill_fetch_ref` in Pay Bill.

---

### 3. Check Charges

```
POST /api/partner/pay2new/charges
```

**Request:**
```json
{
  "amount": 15234
}
```

**Response:**
```json
{
  "success": true,
  "amount": 15234,
  "scheme_name": "Default BBPS Scheme",
  "charges": {
    "base_charge": 100,
    "gst_percent": 18,
    "gst_amount": 18,
    "total_charge": 118
  }
}
```

**Total wallet debit = amount + total_charge** (e.g., ₹15,234 + ₹118 = ₹15,352)

---

### 4. Pay Bill

```
POST /api/partner/pay2new/bill/pay
```

**Request:**
```json
{
  "number": "5008",
  "amount": 15234,
  "product_code": "ICICI_CREDIT_CARD",
  "product_name": "ICICI CREDIT CARD",
  "bill_fetch_ref": "P2N_ORD_1234567890",
  "customer_number": "9971969046",
  "optional1": "9971969046",
  "optional2": "",
  "optional3": "",
  "optional4": "",
  "pincode": "414002"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `number` | Yes | Last 4 digits of credit card |
| `amount` | Yes | Amount in **rupees** |
| `product_code` | Yes | Biller code from Get Billers |
| `product_name` | No | Display name (for records) |
| `bill_fetch_ref` | Yes | `order_id` from Fetch Bill response |
| `customer_number` | Yes | Registered mobile number |
| `optional1` | **Yes** | Mobile number (same as customer_number) |
| `pincode` | No | Default: "414002" |

**Success Response:**
```json
{
  "success": true,
  "order_id": "P2N_PAY_9876543210",
  "operator_reference": "ICICI_REF_20260630_001",
  "amount": 15234,
  "charge": 118,
  "request_id": "SDS1719720000002"
}
```

**Save `request_id`** — use it in Check Status if this request times out.

---

### 5. Check Status

```
POST /api/partner/pay2new/bill/status
```

Use when Pay Bill times out or returns a network error. **Do NOT retry Pay Bill** — use this instead.

**Request (either field works):**
```json
{
  "order_id": "P2N_PAY_9876543210"
}
```
OR
```json
{
  "request_id": "SDS1719720000002"
}
```

**Response:**
```json
{
  "success": true,
  "order_id": "P2N_PAY_9876543210",
  "status": "SUCCESS",
  "amount": 15234,
  "charge": 118,
  "operator_reference": "ICICI_REF_20260630_001",
  "created_at": "2026-06-30T18:30:00.000Z",
  "updated_at": "2026-06-30T18:30:05.000Z",
  "request_id": "SDS1719720000002"
}
```

**Status values:**
| Status | Meaning | Action |
|--------|---------|--------|
| `SUCCESS` | Payment completed | Show success to customer |
| `PENDING` | Still processing | Wait 30-60s, check again |
| `FAILED` | Payment failed | Wallet auto-refunded, safe to retry flow |
| `REFUNDED` | Refunded after failure | Wallet credited back |

---

## Error Handling

### Authentication Errors (check these first)

| HTTP | Code | Fix |
|------|------|-----|
| 401 | `INVALID_API_KEY` | Check your API key is correct and active |
| 401 | `INVALID_SIGNATURE` | Sign `JSON.stringify(body) + timestamp` with compact JSON |
| 401 | `TIMESTAMP_EXPIRED` | Your server clock is off — sync with NTP |
| 403 | `IP_NOT_WHITELISTED` | Ask admin to whitelist your server IP |
| 403 | `SERVICE_NOT_ENABLED` | Ask admin to enable BBPS-2 for your account |

### Business Errors

| Code | Meaning |
|------|---------|
| `INSUFFICIENT_BALANCE` | Top up partner wallet (response includes `required_amount`) |
| `WALLET_FROZEN` | Contact admin |
| `PAYMENT_FAILED` | Upstream failure — wallet auto-refunded |
| `PROVIDER_ERROR` | Network issue with provider — wallet auto-refunded |
| `FETCH_BILL_ERROR` | Invalid card/mobile combination or missing `optional1` |

---

## Complete Integration Flow (Node.js)

```javascript
const crypto = require('crypto');

const API_KEY = 'your_api_key';
const API_SECRET = 'your_api_secret';
const BASE_URL = 'https://api.samedaysolution.in';

function sign(bodyObject) {
  const timestamp = Date.now().toString();
  const bodyString = bodyObject ? JSON.stringify(bodyObject) : '';
  const payload = bodyString + timestamp;
  const signature = crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');
  return { timestamp, signature, bodyString };
}

async function api(method, path, bodyObject) {
  const { timestamp, signature, bodyString } = sign(bodyObject);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'x-signature': signature,
      'x-timestamp': timestamp,
    },
    body: method === 'POST' ? bodyString : undefined,
  });
  return res.json();
}

async function payBill(cardLast4, mobileNumber, productCode, amount) {
  // Step 1: Fetch bill
  const bill = await api('POST', '/api/partner/pay2new/bill/fetch', {
    number: cardLast4,
    product_code: productCode,
    customer_number: mobileNumber,
    optional1: mobileNumber,
    optional2: '', optional3: '', optional4: '',
    pincode: '414002',
  });
  
  if (!bill.success) throw new Error(bill.error?.message || 'Bill fetch failed');
  
  // Step 2: Check charges
  const charges = await api('POST', '/api/partner/pay2new/charges', { amount });
  
  // Step 3: Pay
  const payment = await api('POST', '/api/partner/pay2new/bill/pay', {
    number: cardLast4,
    amount,
    product_code: productCode,
    product_name: productCode.replace(/_/g, ' '),
    bill_fetch_ref: bill.order_id,
    customer_number: mobileNumber,
    optional1: mobileNumber,
    optional2: '', optional3: '', optional4: '',
    pincode: '414002',
  });
  
  return payment;
}

// Usage
const billers = await api('GET', '/api/partner/pay2new/billers', null);
const result = await payBill('5008', '9971969046', 'ICICI_CREDIT_CARD', 15234);
console.log(result);
```

---

## Checklist Before Going Live

- [ ] API Key & Secret obtained from admin
- [ ] Server IP whitelisted by admin
- [ ] BBPS-2 (Pay2New) enabled on your partner account
- [ ] Server clock synced (NTP) — timestamp must be within 5 minutes
- [ ] Signature computed on **compact JSON** (`JSON.stringify`, no formatting)
- [ ] `optional1` always set to mobile number for CC billers
- [ ] `number` field sends only **last 4 digits** (not full card number)
- [ ] `bill_fetch_ref` saved from Fetch Bill and passed to Pay Bill
- [ ] Timeout handling uses Check Status (never retry Pay Bill blindly)
- [ ] Error responses handled for all codes listed above
