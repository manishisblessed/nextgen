"use client";

import { useState } from "react";
import { Copy, Plus, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type ApiKey = { id: string; label: string; prefix: string; createdAt: string; lastUsed: string; env: "Production" | "Sandbox" };

const initialKeys: ApiKey[] = [
  { id: "K1", label: "Kapoor white-label backend", prefix: "pk_live_8h2sXX", createdAt: "Mar 12, 2026", lastUsed: "2 min ago", env: "Production" },
  { id: "K2", label: "Mobile app · Android", prefix: "pk_live_a2lkQ9", createdAt: "Feb 04, 2026", lastUsed: "14 min ago", env: "Production" },
  { id: "K3", label: "Sandbox playground", prefix: "pk_test_6plaB1", createdAt: "Jan 21, 2026", lastUsed: "3 days ago", env: "Sandbox" }
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState(initialKeys);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="API keys"
        description="Programmatic access to all 60+ services. Rotate often, scope tightly, restrict by IP."
        actions={
          <Button>
            <Plus className="h-4 w-4" /> New key
          </Button>
        }
      />

      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">Security best practices</h3>
            <p className="mt-1 text-sm text-ink-600">
              Keys are shown only once at creation. Use short-lived tokens for browser/mobile apps via OAuth. All requests require HTTPS, mutual-TLS optional.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Label</th>
              <th className="px-5 py-3 font-semibold">Key</th>
              <th className="px-5 py-3 font-semibold">Env</th>
              <th className="px-5 py-3 font-semibold">Created</th>
              <th className="px-5 py-3 font-semibold">Last used</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-800">
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-ink-50/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 font-semibold text-ink-900">
                    <KeyRound className="h-4 w-4 text-ink-400" /> {k.label}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    {k.prefix}…<span className="text-ink-400">••••••••••</span>
                    <button className="rounded p-1 text-ink-500 hover:bg-ink-100" title="Copy">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={k.env === "Production" ? "brand" : "default"}>{k.env}</Badge>
                </td>
                <td className="px-5 py-3 text-ink-500">{k.createdAt}</td>
                <td className="px-5 py-3 text-ink-500">{k.lastUsed}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setKeys((ks) => ks.filter((x) => x.id !== k.id))}
                    className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50"
                    title="Revoke"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-ink-100 bg-ink-900 p-6 font-mono text-xs text-ink-100">
        <div className="mb-2 text-ink-300"># Make your first API call</div>
        <div className="text-emerald-300">curl https://api.jmpnextgenpay.com/v1/aeps/balance \</div>
        <div>  -H &quot;Authorization: Bearer pk_live_8h2sXX...&quot; \</div>
        <div>  -d aadhaar=XXXX-XXXX-1234 -d bank=SBIN \</div>
        <div>  -d biometric=&lt;base64&gt;</div>
      </div>
    </div>
  );
}
