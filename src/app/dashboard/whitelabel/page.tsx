"use client";

import { Globe, Palette, Smartphone, Save } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";

export default function WhitelabelPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="White-label portal"
        description="Run NextGenPay under your own brand, domain and colors. SSL is auto-provisioned."
        actions={<Button><Save className="h-4 w-4" /> Save & republish</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Brand identity" icon={<Palette className="h-5 w-5" />}>
            <div className="grid gap-5 md:grid-cols-2">
              <div><Label>Brand name</Label><Input defaultValue="KapoorPay" /></div>
              <div><Label>Tagline</Label><Input defaultValue="Bharat ka apna fintech" /></div>
              <div><Label>Primary color</Label><Input defaultValue="#185df5" /></div>
              <div><Label>Accent color</Label><Input defaultValue="#f97606" /></div>
              <div className="md:col-span-2"><Label>Favicon URL</Label><Input defaultValue="https://cdn.kapoorpay.in/favicon.svg" /></div>
            </div>
          </Card>

          <Card title="Domain & email" icon={<Globe className="h-5 w-5" />}>
            <div className="grid gap-5 md:grid-cols-2">
              <div><Label>Custom domain</Label><Input defaultValue="kapoorpay.in" /></div>
              <div><Label>SSL status</Label><Input value="Active · expires Mar 12, 2027" readOnly /></div>
              <div><Label>From email</Label><Input defaultValue="hello@kapoorpay.in" /></div>
              <div><Label>SPF / DKIM</Label><Input value="Verified" readOnly /></div>
            </div>
          </Card>

          <Card title="Mobile app config" icon={<Smartphone className="h-5 w-5" />}>
            <div className="grid gap-5 md:grid-cols-2">
              <div><Label>App name</Label><Input defaultValue="KapoorPay Retailer" /></div>
              <div><Label>App store ID</Label><Input defaultValue="com.kapoorpay.retailer" /></div>
              <div><Label>Theme</Label>
                <Select><option>Auto · light/dark</option><option>Light</option><option>Dark</option></Select>
              </div>
              <div><Label>Push provider</Label>
                <Select><option>FCM</option><option>OneSignal</option><option>Custom</option></Select>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
            <div className="border-b border-ink-100 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Live preview</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">kapoorpay.in</p>
            </div>
            <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">KapoorPay</p>
              <p className="mt-3 font-display text-2xl font-bold">Bharat ka apna fintech</p>
              <p className="mt-1 text-sm text-white/85">60+ services · Pan-India · Built on NextGenPay</p>
              <button className="mt-4 rounded-full bg-white text-brand-700 px-4 py-1.5 text-sm font-semibold">Login</button>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <strong>Powered by NextGenPay.</strong> Footer attribution required on all white-labels.
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
        <h3 className="font-display text-base font-semibold text-ink-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}
