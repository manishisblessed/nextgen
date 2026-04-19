/**
 * Resend email adapter.
 * Activate: PARTNER_EMAIL_ENABLED=true
 * Required: RESEND_API_KEY, EMAIL_FROM
 */
import type { EmailProvider, PartnerResult } from "./types";

export const resendEmail: EmailProvider = {
  name: "RESEND",
  async send({ to, subject, html, from }) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY!}` },
        body: JSON.stringify({ from: from ?? process.env.EMAIL_FROM, to, subject, html })
      });
      const json = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, code: `HTTP_${res.status}`, message: json.message ?? "resend error", raw: json };
      return { ok: true, data: { messageId: json.id! } } satisfies PartnerResult<{ messageId: string }>;
    } catch (e) {
      return { ok: false, code: "NETWORK", message: (e as Error).message };
    }
  }
};

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
