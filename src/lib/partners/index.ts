/**
 * Central partner registry. Business logic should ONLY ever import from
 * this file (or types.ts) — never from a vendor-specific adapter.
 *
 * Each vertical is resolved at request time so toggling
 * `PARTNER_*_ENABLED` does not require a rebuild.
 */
import { flags } from "../env";
import * as mock from "./mock";
import { paysprintAeps, paysprintConfigured, paysprintDmt } from "./paysprint";
import { razorpayPayout, razorpayPayoutConfigured, razorpayUpi, razorpayUpiConfigured } from "./razorpay";
import { bulkpeConfigured, bulkpePayout } from "./bulkpe";
import { msg91Configured, msg91Sms } from "./msg91";
import { resendConfigured, resendEmail } from "./resend";
import { ekychubConfigured, ekychubVerification } from "./ekychub";
import { twilioVerify, isTwilioOtpEnabled } from "./twilio";
import type {
  AepsProvider,
  BbpsProvider,
  DmtProvider,
  EmailProvider,
  OtpVerifyProvider,
  PanProvider,
  PayoutProvider,
  RechargeProvider,
  SmsProvider,
  TravelProvider,
  UpiProvider
} from "./types";

export type Vertical =
  | "aeps"
  | "dmt"
  | "upi"
  | "payout"
  | "bbps"
  | "recharge"
  | "travel"
  | "pan"
  | "sms"
  | "email"
  | "verification"
  | "otpVerify";

export type ProviderMap = {
  aeps: AepsProvider;
  dmt: DmtProvider;
  upi: UpiProvider;
  payout: PayoutProvider;
  bbps: BbpsProvider;
  recharge: RechargeProvider;
  travel: TravelProvider;
  pan: PanProvider;
  sms: SmsProvider;
  email: EmailProvider;
  verification: typeof ekychubVerification;
  otpVerify: OtpVerifyProvider;
};

export function getPartner<V extends Vertical>(v: V): ProviderMap[V] {
  switch (v) {
    case "aeps":
      return (flags.aeps && paysprintConfigured() ? paysprintAeps : mock.mockAeps) as ProviderMap[V];
    case "dmt":
      return (flags.dmt && paysprintConfigured() ? paysprintDmt : mock.mockDmt) as ProviderMap[V];
    case "upi":
      return (flags.upi && razorpayUpiConfigured() ? razorpayUpi : mock.mockUpi) as ProviderMap[V];
    case "payout":
      // Prefer BulkPe; fall back to RazorpayX if only that is configured; else MOCK.
      if (flags.payout && bulkpeConfigured()) return bulkpePayout as ProviderMap[V];
      if (flags.payout && razorpayPayoutConfigured()) return razorpayPayout as ProviderMap[V];
      return mock.mockPayout as ProviderMap[V];
    case "bbps":
      return mock.mockBbps as ProviderMap[V]; // wire BillAvenue/Setu adapter when contracted
    case "recharge":
      return mock.mockRecharge as ProviderMap[V]; // wire RechargeAPI / PaySprint
    case "travel":
      return mock.mockTravel as ProviderMap[V]; // wire Tripjack / TBO
    case "pan":
      return mock.mockPan as ProviderMap[V]; // wire NSDL e-Gov
    case "sms":
      return (flags.sms && msg91Configured() ? msg91Sms : mock.mockSms) as ProviderMap[V];
    case "email":
      return (flags.email && resendConfigured() ? resendEmail : mock.mockEmail) as ProviderMap[V];
    case "verification":
      if (!flags.verification || !ekychubConfigured()) {
        throw new Error("Verification partner (eKYC Hub) is not configured. Set PARTNER_VERIFICATION_ENABLED=true and add EKYCHUB_USERNAME/EKYCHUB_API_TOKEN.");
      }
      return ekychubVerification as ProviderMap[V];
    case "otpVerify":
      if (!isTwilioOtpEnabled()) {
        throw new Error("Twilio Verify is not configured. Set PARTNER_OTP_PROVIDER=twilio and add TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SERVICE_SID.");
      }
      return twilioVerify as unknown as ProviderMap[V];
  }
  throw new Error(`Unknown vertical: ${v as string}`);
}

/** For /api/healthz and the admin "Integrations" page. */
export function partnerStatus() {
  return {
    aeps:     { live: flags.aeps && paysprintConfigured(), provider: flags.aeps && paysprintConfigured() ? "PAYSPRINT" : "MOCK" },
    dmt:      { live: flags.dmt && paysprintConfigured(), provider: flags.dmt && paysprintConfigured() ? "PAYSPRINT" : "MOCK" },
    upi:      { live: flags.upi && razorpayUpiConfigured(), provider: flags.upi && razorpayUpiConfigured() ? "RAZORPAY" : "MOCK" },
    payout:   { live: flags.payout && (bulkpeConfigured() || razorpayPayoutConfigured()), provider: flags.payout && bulkpeConfigured() ? "BULKPE" : flags.payout && razorpayPayoutConfigured() ? "RAZORPAYX" : "MOCK" },
    bbps:     { live: false, provider: "MOCK" },
    recharge: { live: false, provider: "MOCK" },
    travel:   { live: false, provider: "MOCK" },
    pan:      { live: false, provider: "MOCK" },
    sms:      { live: flags.sms && msg91Configured(), provider: flags.sms && msg91Configured() ? "MSG91" : "MOCK" },
    email:    { live: flags.email && resendConfigured(), provider: flags.email && resendConfigured() ? "RESEND" : "MOCK" },
    verification: { live: flags.verification && ekychubConfigured(), provider: flags.verification && ekychubConfigured() ? "EKYCHUB" : "NONE" },
    otpVerify: { live: isTwilioOtpEnabled(), provider: isTwilioOtpEnabled() ? "TWILIO_VERIFY" : "NONE" }
  };
}

export type * from "./types";
