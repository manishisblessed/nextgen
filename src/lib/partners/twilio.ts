/**
 * Twilio Verify adapter — managed OTP service.
 *
 * Unlike MSG91 where we generate + store + deliver OTPs ourselves, Twilio Verify
 * handles the entire lifecycle: generation, delivery (SMS/WhatsApp), and
 * verification. This means no local OTP record in the `Otp` table for
 * Twilio-handled verifications.
 *
 * Twilio uses their own DLT-registered sender IDs and templates for India,
 * so the client does NOT need their own DLT registration.
 *
 * Activate: PARTNER_OTP_PROVIDER=twilio
 * Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
 */
import type { PartnerResult } from "./types";

function accountSid(): string {
  return process.env.TWILIO_ACCOUNT_SID!;
}

function authToken(): string {
  return process.env.TWILIO_AUTH_TOKEN!;
}

function verifyServiceSid(): string {
  return process.env.TWILIO_VERIFY_SERVICE_SID!;
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${accountSid()}:${authToken()}`).toString("base64")}`;
}

export function twilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

export function isTwilioOtpEnabled(): boolean {
  return process.env.PARTNER_OTP_PROVIDER === "twilio" && twilioConfigured();
}

/**
 * Send a verification code via Twilio Verify.
 * Twilio generates the OTP and delivers it via the specified channel.
 */
export async function sendVerification(input: {
  to: string;
  channel: "sms" | "email" | "whatsapp";
}): Promise<PartnerResult<{ sid: string; status: string }>> {
  try {
    const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid()}/Verifications`;

    const body = new URLSearchParams({
      To: input.to,
      Channel: input.channel,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await res.json();

    if (res.ok && data.status === "pending") {
      return {
        ok: true,
        data: { sid: data.sid, status: data.status },
        raw: data,
      };
    }

    return {
      ok: false,
      code: `TWILIO_${data.code ?? res.status}`,
      message: data.message ?? "Failed to send verification",
      raw: data,
    };
  } catch (e) {
    return {
      ok: false,
      code: "NETWORK",
      message: (e as Error).message,
    };
  }
}

/**
 * Check a verification code via Twilio Verify.
 * Returns approved/pending/canceled status.
 */
export async function checkVerification(input: {
  to: string;
  code: string;
}): Promise<PartnerResult<{ sid: string; status: string; valid: boolean }>> {
  try {
    const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid()}/VerificationCheck`;

    const body = new URLSearchParams({
      To: input.to,
      Code: input.code,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await res.json();

    if (res.ok && data.status === "approved") {
      return {
        ok: true,
        data: { sid: data.sid, status: data.status, valid: true },
        raw: data,
      };
    }

    if (res.ok) {
      return {
        ok: false,
        code: "INVALID_CODE",
        message: "Invalid verification code",
        raw: data,
      };
    }

    return {
      ok: false,
      code: `TWILIO_${data.code ?? res.status}`,
      message: data.message ?? "Verification check failed",
      raw: data,
    };
  } catch (e) {
    return {
      ok: false,
      code: "NETWORK",
      message: (e as Error).message,
    };
  }
}

/**
 * Send a transactional SMS via Twilio Programmable Messaging.
 * Used for non-OTP messages (e.g. onboard success notification).
 * Requires a Twilio phone number or Messaging Service SID.
 */
export async function sendSms(input: {
  to: string;
  body: string;
}): Promise<PartnerResult<{ messageId: string }>> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid()}/Messages.json`;

    const params = new URLSearchParams({
      To: input.to,
      Body: input.body,
    });

    const msgServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (msgServiceSid) {
      params.set("MessagingServiceSid", msgServiceSid);
    } else if (fromNumber) {
      params.set("From", fromNumber);
    } else {
      return {
        ok: false,
        code: "CONFIG",
        message: "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER is required for transactional SMS",
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (res.ok || res.status === 201) {
      return {
        ok: true,
        data: { messageId: data.sid },
        raw: data,
      };
    }

    return {
      ok: false,
      code: `TWILIO_${data.code ?? res.status}`,
      message: data.message ?? "Failed to send SMS",
      raw: data,
    };
  } catch (e) {
    return {
      ok: false,
      code: "NETWORK",
      message: (e as Error).message,
    };
  }
}

export const twilioVerify = {
  name: "TWILIO_VERIFY",
  sendVerification,
  checkVerification,
  sendSms,
  twilioConfigured,
  isTwilioOtpEnabled,
} as const;
