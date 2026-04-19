"use client";

import { Megaphone, Mail, MessageSquare, Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";

const campaigns = [
  { id: "C1", name: "AePS double cashback weekend", channel: "WhatsApp", reach: 8420, ctr: "12.4%", status: "Live" },
  { id: "C2", name: "Recharge ₹100 + ₹10 cashback", channel: "SMS", reach: 24812, ctr: "4.8%", status: "Live" },
  { id: "C3", name: "Distributor onboarding drive", channel: "Email", reach: 1248, ctr: "8.1%", status: "Scheduled" },
  { id: "C4", name: "BBPS bills ka dhamaka", channel: "In-app", reach: 38400, ctr: "15.2%", status: "Ended" }
];

export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Marketing tools"
        description="WhatsApp / SMS / Email blasts, in-app banners, and ready-made creatives for your network."
        actions={<Button><Megaphone className="h-4 w-4" /> New campaign</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: MessageSquare, l: "WhatsApp templates", v: "24" },
          { icon: Mail, l: "Email campaigns (MTD)", v: "12" },
          { icon: ImageIcon, l: "Creative assets", v: "182" },
          { icon: Megaphone, l: "Active push", v: "6" }
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-ink-100 bg-white p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-100 text-accent-700">
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-ink-500">{s.l}</p>
            <p className="mt-1 font-display text-xl font-bold text-ink-900">{s.v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="border-b border-ink-100 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-ink-900">Recent campaigns</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Campaign</th>
              <th className="px-5 py-3 font-semibold">Channel</th>
              <th className="px-5 py-3 font-semibold text-right">Reach</th>
              <th className="px-5 py-3 font-semibold text-right">CTR</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-ink-50/40">
                <td className="px-5 py-3 font-semibold text-ink-900">{c.name}</td>
                <td className="px-5 py-3">{c.channel}</td>
                <td className="px-5 py-3 text-right">{c.reach.toLocaleString("en-IN")}</td>
                <td className="px-5 py-3 text-right">{c.ctr}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    c.status === "Live" ? "bg-emerald-100 text-emerald-700"
                    : c.status === "Scheduled" ? "bg-amber-100 text-amber-700"
                    : "bg-ink-100 text-ink-500"}`}
                  >{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
