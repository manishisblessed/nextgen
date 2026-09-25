"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { RefreshCw, Gauge, Save } from "lucide-react";
import { isLimitSettingKey } from "@/lib/limit-keys";

/**
 * Limits — the ONE place any user-transaction cap is raised or lowered.
 *
 * A focused view over the same PlatformSetting store as Platform Controls, but
 * filtered to the user-transaction limit keys (see `src/lib/limit-keys.ts`).
 * Platform Controls hides these keys, so a given limit is edited in exactly one
 * tab. Changes apply instantly — no deploy — and are enforced at the source
 * (QR claim precheck, wallet caps, settlement defaults). Master Admin only.
 */

type SettingsMap = Record<string, Record<string, unknown>>;

const LABELS: Record<string, { title: string; description: string }> = {
  "limits.qr_claim": {
    title: "QR claim limits",
    description:
      "Per-claim and per-day caps for retailer QR settlement claims, plus the claim window. The maker-checker 'second approval above ₹X' fraud threshold is intentionally NOT here — it stays in Platform Controls / env so raising a ceiling never disarms dual approval.",
  },
  "limits.settlement_defaults": {
    title: "Default settlement limits",
    description: "Daily / per-transfer settlement caps for users who have no custom per-user limit.",
  },
  "wallet.global_cap": {
    title: "Wallet cap",
    description: "Maximum primary-wallet balance any network user may hold.",
  },
  "wallet.op_max_amount": {
    title: "Wallet operation limit",
    description:
      "Maximum amount for a single admin push/pull, network parent→child transfer, or lien. Applies instantly; hard-capped at ₹100 crore.",
  },
};

const FIELD_LABELS: Record<string, string> = {
  enabled: "Enabled",
  amount: "Amount (₹)",
  dailyCap: "Daily cap (₹)",
  perTxnCap: "Per-transfer cap (₹)",
  // limits.qr_claim
  maxAmount: "Per-claim max (₹)",
  dailyAmount: "Daily amount cap (₹)",
  dailyCount: "Daily claim count",
  switchGraceMinutes: "Switch grace (minutes)",
  maxAgeDays: "Max payment age (days)",
};

const inputCls =
  "rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function LimitsPage() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [drafts, setDrafts] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-settings");
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Failed to load settings");
      // Keep only the user-transaction limit keys — everything else lives in
      // Platform Controls.
      const all = (d.settings ?? {}) as SettingsMap;
      const limitsOnly: SettingsMap = {};
      for (const key of Object.keys(all)) {
        if (isLimitSettingKey(key)) limitsOnly[key] = all[key];
      }
      setSettings(limitsOnly);
      setDrafts(JSON.parse(JSON.stringify(limitsOnly)));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string) => {
    setSavingKey(key);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: drafts[key] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Save failed");
      notify(`${LABELS[key]?.title ?? key} saved.`, true);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSavingKey(null);
    }
  };

  const setField = (key: string, field: string, value: unknown) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const isDirty = (key: string) =>
    settings && JSON.stringify(settings[key]) !== JSON.stringify(drafts[key]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Limits"
        description="The single place to raise or lower any user-transaction limit — QR claim caps, wallet caps, and settlement defaults. Changes apply instantly, no deploy needed. Master Admin only."
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      {loading && !settings && <p className="text-sm text-ink-400">Loading limits…</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {settings &&
          Object.keys(settings).map((key) => {
            const meta = LABELS[key] ?? { title: key, description: "" };
            const draft = drafts[key] ?? {};
            return (
              <div key={key} className="rounded-2xl border border-ink-100 bg-white p-5">
                <div className="mb-1 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-brand-600" />
                  <h3 className="text-sm font-bold text-ink-900">{meta.title}</h3>
                </div>
                <p className="mb-4 text-xs text-ink-400">{meta.description}</p>

                <div className="space-y-3">
                  {Object.entries(draft).map(([field, value]) => {
                    const label = FIELD_LABELS[field] ?? field;
                    if (typeof value === "boolean") {
                      return (
                        <label key={field} className="flex items-center gap-2 text-sm text-ink-700">
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) => setField(key, field, e.target.checked)}
                          />
                          {label}
                        </label>
                      );
                    }
                    if (typeof value === "number") {
                      return (
                        <label key={field} className="block text-xs text-ink-500">
                          {label}
                          <input
                            type="number"
                            className={`${inputCls} mt-1 block w-48`}
                            value={value}
                            onChange={(e) => setField(key, field, Number(e.target.value))}
                          />
                        </label>
                      );
                    }
                    return null;
                  })}
                </div>

                <Button
                  className="mt-4"
                  size="sm"
                  disabled={savingKey === key || !isDirty(key)}
                  onClick={() => save(key)}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savingKey === key ? "Saving…" : isDirty(key) ? "Save changes" : "Saved"}
                </Button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
