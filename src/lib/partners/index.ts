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
import { bulkpeConfigured, bulkpePayout, bulkpeUpi } from "./bulkpe";
import { bulkpeBbps, bulkpeBbpsConfigured } from "./bulkpe-bbps";
import { samedayBbps, samedayBbpsConfigured } from "./sameday-bbps";
import { samedaySettlementConfigured } from "./sameday-settlement";
import { leegalityConfigured } from "./leegality";
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

/**
 * BBPS routing — two live rails, chosen per category:
 *   - Same Day BBPS-2 (Pay2New): CREDIT_CARD only (contracted rail, kept
 *     preferred for CC when configured).
 *   - BulkPe BBPS: all categories (electricity, water, gas, CC, ...).
 * When both are configured we dispatch per call on `input.category`; with a
 * single rail configured that rail serves everything it can; otherwise MOCK.
 */
function resolveBbps(): BbpsProvider {
  const sameday = flags.bbps && samedayBbpsConfigured();
  const bulkpe = flags.bbps && bulkpeBbpsConfigured();
  if (sameday && bulkpe) {
    const pick = (category: string) => (category === "CREDIT_CARD" ? samedayBbps : bulkpeBbps);
    return {
      name: "BBPS_ROUTED",
      fetchBill: (input) => pick(input.category).fetchBill(input),
      pay: (input) => pick(input.category).pay(input),
      billers: (category) => pick(category).billers!(category),
      // Status lookups can't see the category; BulkPe transaction ids are
      // "BBPS…"-prefixed, Same Day order ids are not.
      status: (ref) =>
        (ref.orderId?.startsWith("BBPS") ? bulkpeBbps : samedayBbps).status!(ref),
    };
  }
  if (sameday) return samedayBbps;
  if (bulkpe) return bulkpeBbps;
  return mock.mockBbps;
}

export function getPartner<V extends Vertical>(v: V): ProviderMap[V] {
  switch (v) {
    case "aeps":
      return (flags.aeps && paysprintConfigured() ? paysprintAeps : mock.mockAeps) as ProviderMap[V];
    case "dmt":
      return (flags.dmt && paysprintConfigured() ? paysprintDmt : mock.mockDmt) as ProviderMap[V];
    case "upi":
      // Prefer BulkPe Simple PG; fall back to Razorpay when only that is configured.
      if (flags.upi && bulkpeConfigured()) return bulkpeUpi as ProviderMap[V];
      if (flags.upi && razorpayUpiConfigured()) return razorpayUpi as ProviderMap[V];
      return mock.mockUpi as ProviderMap[V];
    case "payout":
      // Prefer BulkPe; fall back to RazorpayX if only that is configured; else MOCK.
      if (flags.payout && bulkpeConfigured()) return bulkpePayout as ProviderMap[V];
      if (flags.payout && razorpayPayoutConfigured()) return razorpayPayout as ProviderMap[V];
      return mock.mockPayout as ProviderMap[V];
    case "bbps":
      return resolveBbps() as ProviderMap[V];
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
    upi:      { live: flags.upi && (bulkpeConfigured() || razorpayUpiConfigured()), provider: flags.upi && bulkpeConfigured() ? "BULKPE_PG" : flags.upi && razorpayUpiConfigured() ? "RAZORPAY" : "MOCK" },
    payout:   { live: flags.payout && (bulkpeConfigured() || razorpayPayoutConfigured()), provider: flags.payout && bulkpeConfigured() ? "BULKPE" : flags.payout && razorpayPayoutConfigured() ? "RAZORPAYX" : "MOCK" },
    bbps:     (() => {
      const p = resolveBbps();
      const live = flags.bbps && (samedayBbpsConfigured() || bulkpeBbpsConfigured());
      return { live, provider: !live ? "MOCK" : p.name === "BBPS_ROUTED" ? "SAMEDAY_PAY2NEW+BULKPE_BBPS" : p.name };
    })(),
    recharge: { live: false, provider: "MOCK" },
    travel:   { live: false, provider: "MOCK" },
    pan:      { live: false, provider: "MOCK" },
    sms:      { live: flags.sms && msg91Configured(), provider: flags.sms && msg91Configured() ? "MSG91" : "MOCK" },
    email:    { live: flags.email && resendConfigured(), provider: flags.email && resendConfigured() ? "RESEND" : "MOCK" },
    verification: { live: flags.verification && ekychubConfigured(), provider: flags.verification && ekychubConfigured() ? "EKYCHUB" : "NONE" },
    otpVerify: { live: isTwilioOtpEnabled(), provider: isTwilioOtpEnabled() ? "TWILIO_VERIFY" : "NONE" },
    settlement: { live: flags.settlement && samedaySettlementConfigured(), provider: flags.settlement && samedaySettlementConfigured() ? "SAMEDAY" : "NONE" },
    esign:    { live: flags.esign && leegalityConfigured(), provider: flags.esign && leegalityConfigured() ? "LEEGALITY" : "NONE" }
  };
}

export type * from "./types";
