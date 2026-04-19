/**
 * MSG91 SMS / OTP adapter (DLT-compliant for India).
 *
 * Activate: PARTNER_SMS_ENABLED=true
 * Required: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_SENDER_ID
 */
import type { PartnerResult, SmsProvider } from "./types";

async function call<T>(path: string, body: unknown): Promise<PartnerResult<T>> {
  try {
    const res = await fetch(`https://control.msg91.com/api/v5${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authkey: process.env.MSG91_AUTH_KEY! },
      body: JSON.stringify(body)
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || (json.type && json.type !== "success")) {
      return { ok: false, code: String(json.type ?? `HTTP_${res.status}`), message: String(json.message ?? "MSG91 error"), raw: json };
    }
    return { ok: true, data: json as T, raw: json };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

export const msg91Sms: SmsProvider = {
  name: "MSG91",
  async sendOtp({ phone, otp, templateId }) {
    // strip "+91" or any non-digit
    const mobile = phone.replace(/\D/g, "");
    const r = await call<{ request_id: string }>(`/otp?template_id=${templateId ?? process.env.MSG91_TEMPLATE_ID}&mobile=${mobile}&otp=${otp}`, {});
    return r.ok ? { ok: true, data: { messageId: r.data.request_id } } : r;
  },
  async sendTransactional({ phone, templateId, variables }) {
    const r = await call<{ request_id: string }>(`/flow/`, {
      template_id: templateId,
      sender: process.env.MSG91_SENDER_ID,
      mobiles: phone.replace(/\D/g, ""),
      ...variables
    });
    return r.ok ? { ok: true, data: { messageId: r.data.request_id } } : r;
  }
};

export function msg91Configured(): boolean {
  return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
}
