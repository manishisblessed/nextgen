"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { getSession, type Role } from "@/lib/auth";
import { generateUserCode } from "@/lib/utils";

const STEPS = ["Basic info", "KYC", "Commission slab", "Review"] as const;

export default function OnboardPage() {
  const [role, setRole] = useState<Role>("retailer");
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [refId, setRefId] = useState("");

  useEffect(() => {
    const s = getSession();
    if (s) setRole(s.role);
  }, []);

  const childLabel = role === "master-distributor" ? "distributor" : "retailer";

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-10 text-center shadow-soft">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-glow">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold text-ink-900">
          Onboarding submitted
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          A welcome email + activation link has been sent to the new {childLabel}. KYC will auto-verify with DigiLocker once they upload Aadhaar.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-mono shadow-sm">
          Ref: <strong>{refId}</strong>
        </div>
        <div className="mt-6">
          <Button onClick={() => { setDone(false); setStep(0); }}>
            Onboard another <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Onboard"
        title={`Add a new ${childLabel}`}
        description="Four-step onboarding · auto-KYC · commission slab in place before first transaction."
      />

      <ol className="flex flex-wrap items-center gap-3">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                i <= step ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500"
              }`}
            >
              {i + 1}
            </span>
            <span className={i <= step ? "text-sm font-semibold text-ink-900" : "text-sm text-ink-500"}>
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="mx-2 h-px w-8 bg-ink-200" />}
          </li>
        ))}
      </ol>

      <form
        className="rounded-2xl border border-ink-100 bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) setStep(step + 1);
          else {
            setRefId(
              generateUserCode(
                role === "master-distributor" ? "distributor" : "retailer"
              )
            );
            setDone(true);
          }
        }}
      >
        {step === 0 && (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Owner full name"><Input required defaultValue="" placeholder="As per PAN" /></Field>
            <Field label="Shop / firm name"><Input required placeholder="Sharma Mobile World" /></Field>
            <Field label="Mobile (verified)"><Input required defaultValue="+91 " /></Field>
            <Field label="Email"><Input required type="email" placeholder="owner@example.com" /></Field>
            <Field label="Pin code"><Input required maxLength={6} /></Field>
            <Field label="State">
              <Select required>
                <option>Uttar Pradesh</option><option>Maharashtra</option><option>Karnataka</option>
                <option>Delhi</option><option>West Bengal</option><option>Tamil Nadu</option>
              </Select>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="PAN number"><Input required maxLength={10} className="uppercase" placeholder="ABCDE1234F" /></Field>
            <Field label="Aadhaar number"><Input required maxLength={14} placeholder="XXXX XXXX XXXX" /></Field>
            <Field label="GSTIN (optional)"><Input maxLength={15} className="uppercase" /></Field>
            <Field label="Bank account">
              <div className="grid grid-cols-3 gap-2">
                <Input required placeholder="Account number" className="col-span-2" />
                <Input required placeholder="IFSC" className="uppercase" />
              </div>
            </Field>
            <div className="md:col-span-2 rounded-xl border border-dashed border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              <ShieldCheck className="mr-2 inline h-4 w-4" />
              KYC will auto-verify against DigiLocker · NSDL PAN · Penny-drop. No manual review needed in 92% of cases.
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Slab template">
              <Select>
                <option>Standard ({role === "master-distributor" ? "JNPD-default" : "JNPR-default"})</option>
                <option>Growth (1.2x AePS payout)</option>
                <option>Power (custom)</option>
              </Select>
            </Field>
            <Field label="AePS payout (%)"><Input defaultValue="0.40" /></Field>
            <Field label="DMT payout (₹/txn)"><Input defaultValue="6" /></Field>
            <Field label="Recharge payout (%)"><Input defaultValue="3.00" /></Field>
            <Field label="Bills payout (%)"><Input defaultValue="0.80" /></Field>
            <Field label="Travel payout (%)"><Input defaultValue="5.00" /></Field>
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-5 md:grid-cols-2">
            <Summary heading="Profile" rows={[["Owner", "—"], ["Shop", "—"], ["State", "Uttar Pradesh"]]} />
            <Summary heading="KYC" rows={[["PAN", "ABCDE••••F"], ["Aadhaar", "XXXX-XXXX-•••0"], ["Bank", "ICICI ••1234"]]} />
            <Summary heading="Commission" rows={[["AePS", "0.40%"], ["DMT", "₹6 / txn"], ["Recharge", "3.00%"]]} />
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <strong>Ready to onboard.</strong> Activation link will be sent on submit.
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          <Button type="submit">
            {step === STEPS.length - 1 ? "Submit onboarding" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Summary({ heading, rows }: { heading: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-500">{heading}</p>
      <dl className="mt-2 space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-ink-500">{k}</dt>
            <dd className="font-semibold text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
