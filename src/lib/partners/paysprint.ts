/**
 * PaySprint adapter — covers AePS + DMT + (optionally) BBPS.
 *
 * Activate by:  PARTNER_AEPS_ENABLED=true  (and/or PARTNER_DMT_ENABLED=true)
 * Required env: PAYSPRINT_PARTNER_ID, PAYSPRINT_API_KEY, PAYSPRINT_JWT_KEY,
 *               PAYSPRINT_AES_KEY, PAYSPRINT_AES_IV, PAYSPRINT_BASE_URL.
 *
 * PaySprint requires an AES-256-CBC encrypted JSON body and a JWT
 * authorization token. This file handles the entire wire-format so the
 * rest of the app stays vendor-agnostic.
 */
import crypto from "crypto";
import type {
  AepsProvider,
  DmtProvider,
  PartnerResult,
  AepsWithdrawOutput,
  AepsBalanceOutput,
  DmtTransferOutput,
} from "./types";

const baseUrl = () => process.env.PAYSPRINT_BASE_URL!;
const partnerId = () => process.env.PAYSPRINT_PARTNER_ID!;

// ---------------------------------------------------------------------------
// AES-256-CBC encryption for request bodies
// ---------------------------------------------------------------------------

function aesEncrypt(plaintext: string): string {
  const key = Buffer.from(process.env.PAYSPRINT_AES_KEY!, "utf-8").subarray(
    0,
    32
  );
  const iv = Buffer.from(process.env.PAYSPRINT_AES_IV!, "utf-8").subarray(
    0,
    16
  );
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

function aesDecrypt(ciphertext: string): string {
  const key = Buffer.from(process.env.PAYSPRINT_AES_KEY!, "utf-8").subarray(
    0,
    32
  );
  const iv = Buffer.from(process.env.PAYSPRINT_AES_IV!, "utf-8").subarray(
    0,
    16
  );
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// JWT (HS256) — PaySprint uses a custom JWT for the Token header
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createJwt(payload: Record<string, unknown>): string {
  const jwtKey = process.env.PAYSPRINT_JWT_KEY!;
  const header = base64url(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  );
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = base64url(
    crypto.createHmac("sha256", jwtKey).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

// ---------------------------------------------------------------------------
// Core API caller
// ---------------------------------------------------------------------------

async function call<T>(
  path: string,
  body: Record<string, unknown>
): Promise<PartnerResult<T>> {
  try {
    const encrypted = aesEncrypt(JSON.stringify(body));

    const token = createJwt({
      timestamp: Date.now(),
      partnerId: partnerId(),
      reqid: crypto.randomUUID(),
    });

    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Token: token,
        Authorisedkey: process.env.PAYSPRINT_API_KEY!,
      },
      body: JSON.stringify({ body: encrypted }),
    });

    const raw = (await res.json()) as Record<string, unknown>;

    // PaySprint returns response_type=1 or status=true on success
    const isSuccess =
      raw.response_type === 1 ||
      raw.status === true ||
      raw.statuscode === "TXN";

    if (!isSuccess) {
      return {
        ok: false,
        code: String(
          raw.response_type ?? raw.statuscode ?? raw.status ?? "UNKNOWN"
        ),
        message: String(raw.message ?? "PaySprint request failed"),
        raw,
      };
    }

    // Decrypt response data if it's an encrypted string
    let data: T;
    if (typeof raw.data === "string" && raw.data.length > 20) {
      try {
        data = JSON.parse(aesDecrypt(raw.data)) as T;
      } catch {
        data = raw as T;
      }
    } else {
      data = raw as T;
    }

    return {
      ok: true,
      data,
      partnerTxnId: String(
        raw.ackno ?? raw.txnid ?? raw.referenceid ?? ""
      ),
      raw,
    };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// AePS adapter
// ---------------------------------------------------------------------------

export const paysprintAeps: AepsProvider = {
  name: "PAYSPRINT-AEPS",

  async balance(input) {
    const r = await call<Record<string, unknown>>(
      "/service/balance/balance/",
      {
        latitude: "28.65195",
        longitude: "77.23149",
        mobilenumber: input.userId,
        referenceno: input.idempotencyKey,
        ipaddress: input.ip ?? "0.0.0.0",
        adhaarnumber: input.aadhaar,
        accessmodetype: "SITE",
        nationalbankidentification: input.bankIin,
        requestremarks: "Balance enquiry",
        data: input.biometric.data,
        pipe: "bank1",
        timestamp: new Date().toISOString(),
      }
    );
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        balance: Number(r.data.balanceamount ?? r.data.balance ?? 0),
        txnReference: String(r.data.ackno ?? r.partnerTxnId ?? ""),
      } satisfies AepsBalanceOutput,
      partnerTxnId: r.partnerTxnId,
      raw: r.raw,
    };
  },

  async withdraw(input) {
    const r = await call<Record<string, unknown>>(
      "/service/aeps/aepswithdraw/",
      {
        latitude: "28.65195",
        longitude: "77.23149",
        mobilenumber: input.userId,
        referenceno: input.idempotencyKey,
        ipaddress: input.ip ?? "0.0.0.0",
        adhaarnumber: input.aadhaar,
        accessmodetype: "SITE",
        nationalbankidentification: input.bankIin,
        requestremarks: "Cash withdrawal",
        data: input.biometric.data,
        pipe: "bank1",
        timestamp: new Date().toISOString(),
        amount: input.amount,
        is_iris: "NO",
      }
    );
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        amountDispensed: Number(r.data.amount ?? input.amount),
        bankRRN: String(r.data.bankrrn ?? r.data.rrn ?? ""),
        txnReference: String(r.data.ackno ?? r.partnerTxnId ?? ""),
      } satisfies AepsWithdrawOutput,
      partnerTxnId: r.partnerTxnId,
      raw: r.raw,
    };
  },

  async miniStatement(input) {
    const r = await call<Record<string, unknown>>(
      "/service/aeps/ministatement/",
      {
        latitude: "28.65195",
        longitude: "77.23149",
        mobilenumber: input.userId,
        referenceno: input.idempotencyKey,
        ipaddress: input.ip ?? "0.0.0.0",
        adhaarnumber: input.aadhaar,
        accessmodetype: "SITE",
        nationalbankidentification: input.bankIin,
        requestremarks: "Mini statement",
        data: input.biometric.data,
        pipe: "bank1",
        timestamp: new Date().toISOString(),
      }
    );
    if (!r.ok) return r;
    const miniStmt = Array.isArray(r.data.ministatement)
      ? (r.data.ministatement as Array<Record<string, unknown>>).map((e) => ({
          date: String(e.date ?? ""),
          amount: Number(e.amount ?? 0),
          type: (String(e.txnType ?? e.type ?? "CR") === "CR"
            ? "CR"
            : "DR") as "CR" | "DR",
          narration: String(e.narration ?? e.description ?? ""),
        }))
      : [];
    return {
      ok: true,
      data: { entries: miniStmt },
      partnerTxnId: r.partnerTxnId,
      raw: r.raw,
    };
  },
};

// ---------------------------------------------------------------------------
// DMT adapter
// ---------------------------------------------------------------------------

export const paysprintDmt: DmtProvider = {
  name: "PAYSPRINT-DMT",

  async verifyBeneficiary(input) {
    const r = await call<Record<string, unknown>>(
      "/service/dmt/beneficiary/registerbeneficiary/benenameverify",
      {
        ifsc: input.ifsc,
        accountNumber: input.accountNumber,
      }
    );
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        name: String(r.data.benename ?? r.data.accountName ?? ""),
        verified: Boolean(r.data.verified ?? true),
      },
      raw: r.raw,
    };
  },

  async transfer(input) {
    const r = await call<Record<string, unknown>>(
      "/service/dmt/transact/dotransaction",
      {
        mode: input.mode,
        mobile: input.remitterMobile,
        bession_id: input.idempotencyKey,
        referenceid: input.idempotencyKey,
        bene_id: `${input.beneficiary.ifsc}_${input.beneficiary.accountNumber}`,
        benename: input.beneficiary.name,
        beneaccno: input.beneficiary.accountNumber,
        ifsccode: input.beneficiary.ifsc,
        benemobile: input.beneficiary.mobile ?? input.remitterMobile,
        pincode: "110001",
        address: "India",
        amount: input.amount,
        gst_state: "07",
        dob: "01-01-1990",
        pipe: "bank1",
        txntype: input.mode,
      }
    );
    if (!r.ok) return r;

    const fee =
      input.mode === "RTGS" ? 12 : input.mode === "NEFT" ? 6 : 5;

    return {
      ok: true,
      data: {
        bankRRN: String(r.data.utr ?? r.data.rrn ?? ""),
        txnReference: String(r.data.ackno ?? r.partnerTxnId ?? ""),
        charged: input.amount + fee,
      } satisfies DmtTransferOutput,
      partnerTxnId: r.partnerTxnId,
      raw: r.raw,
    };
  },
};

// ---------------------------------------------------------------------------
// Config check
// ---------------------------------------------------------------------------

export function paysprintConfigured(): boolean {
  return Boolean(
    process.env.PAYSPRINT_PARTNER_ID &&
      process.env.PAYSPRINT_API_KEY &&
      process.env.PAYSPRINT_JWT_KEY &&
      process.env.PAYSPRINT_AES_KEY &&
      process.env.PAYSPRINT_AES_IV
  );
}
