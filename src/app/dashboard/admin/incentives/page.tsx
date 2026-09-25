"use client";

/**
 * Reward Incentives — the retailer-encouragement layer. Each incentive is an
 * expandable card: pick a rail (QR / POS / …) + reward basis, define reward
 * tiers ("slabs" like the scheme tab), assign users (with a per-user threshold
 * override), and run/preview the month-end payout. The engine credits reverse
 * cashback (a % of the MDR the user paid that month) on the last IST day.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Label, Select } from "@/components/ui/Input";
import { AssignUserPicker, type PickerUser } from "@/components/ui/AssignUserPicker";
import { useStepUp } from "@/components/security/StepUpProvider";
import {
  RefreshCw,
  Plus,
  Gift,
  Users,
  ChevronDown,
  Loader2,
  X,
  Pencil,
  Trash2,
  Power,
  Layers,
  PlayCircle,
  Settings2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RateType = "FLAT" | "PERCENT";
type Rail = "QR" | "POS" | "PG" | "COMBINED";
type RewardType = "CASHBACK_ON_MDR" | "CASHBACK_ON_VOLUME" | "FLAT";

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  rail: Rail;
  rewardType: RewardType;
  volumeBasis: "GROSS" | "NET";
  active: boolean;
  tierCount: number;
  userCount: number;
};

type Tier = {
  id: string;
  label: string | null;
  minAmount: number;
  maxAmount: number;
  rewardType: RateType;
  rewardValue: number;
  /** Instant (T+0) rate; 0 = same as rewardValue (T+1). */
  rewardValueT0: number;
  active: boolean;
};

type AssignedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  configId: string;
  minAmount: number | null;
  rewardValue: number | null;
  rewardValueT0: number | null;
  active: boolean;
};

const RAIL_LABEL: Record<Rail, string> = {
  QR: "QR Payments",
  POS: "POS Terminals",
  PG: "Payment Gateway",
  COMBINED: "QR + POS + PG (combined)",
};

const REWARD_LABEL: Record<RewardType, string> = {
  CASHBACK_ON_MDR: "Reverse cashback on MDR paid",
  CASHBACK_ON_VOLUME: "Cashback on volume",
  FLAT: "Flat reward",
};

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtReward(type: RateType, value: number): string {
  if (value === 0) return "—";
  return type === "FLAT" ? fmtINR(value) : `${(value * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function fmtBand(min: number, max: number): string {
  const big = 1_000_000_000;
  return max >= big ? `${fmtINR(min)}+` : `${fmtINR(min)} – ${fmtINR(max)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IncentivesPage() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [createOpen, setCreateOpen] = useState(false);

  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/incentives");
      const data = await res.json();
      if (Array.isArray(data.schemes)) setSchemes(data.schemes);
    } catch {
      notify("Failed to load incentives", false);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      schemes.filter(
        (s) =>
          (statusFilter === "all" || s.active) &&
          (!query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [schemes, query, statusFilter]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Reward Incentives"
        description="Encourage retailers with monthly volume rewards — e.g. QR ₹20 lakh → 0.10% reverse cashback on the MDR they paid. Define tiered slab rates, set per-user thresholds, and the engine auto-credits on the last day of each month."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New incentive
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search incentives…" />
        </div>
        <Select className="w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}>
          <option value="active">Active</option>
          <option value="all">All</option>
        </Select>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-brand-600" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink-600">
            Incentives ({visible.length})
          </h2>
        </div>
        {loading && schemes.length === 0 ? (
          <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center text-sm text-ink-500">
            Loading incentives…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-500">
            No incentives yet. Create one to start rewarding retailers.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((s) => (
              <IncentiveCard key={s.id} scheme={s} notify={notify} onChanged={load} />
            ))}
          </div>
        )}
      </section>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSaved={(msg) => {
            setCreateOpen(false);
            notify(msg, true);
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incentive card
// ---------------------------------------------------------------------------

function IncentiveCard({
  scheme,
  notify,
  onChanged,
}: {
  scheme: Scheme;
  notify: (msg: string, ok: boolean) => void;
  onChanged: () => void;
}) {
  const { fetchWithStepUp } = useStepUp();
  const [expanded, setExpanded] = useState(false);
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [assigned, setAssigned] = useState<AssignedUser[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tierModal, setTierModal] = useState<{ editing: Tier | null } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/incentives/${scheme.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setTiers(data.scheme.tiers ?? []);
      setAssigned(data.assignedUsers ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load", false);
    } finally {
      setLoadingDetail(false);
    }
  }, [scheme.id, notify]);

  useEffect(() => {
    if (expanded && tiers === null) loadDetail();
  }, [expanded, tiers, loadDetail]);

  async function toggleActive() {
    setBusy(true);
    try {
      const res = await fetchWithStepUp(`/api/admin/incentives/${scheme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !scheme.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      notify(scheme.active ? "Incentive deactivated." : "Incentive activated.", true);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", false);
    } finally {
      setBusy(false);
    }
  }

  async function deleteScheme() {
    setBusy(true);
    try {
      const res = await fetchWithStepUp(`/api/admin/incentives/${scheme.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Delete failed");
      notify(data.deactivated ? data.message : "Incentive deleted.", true);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function deleteTier(tier: Tier) {
    try {
      const res = await fetchWithStepUp(`/api/admin/incentives/${scheme.id}/tiers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId: tier.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      notify("Tier removed.", true);
      loadDetail();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    }
  }

  const baseLabel =
    scheme.rewardType === "CASHBACK_ON_MDR"
      ? "% of MDR paid"
      : scheme.rewardType === "CASHBACK_ON_VOLUME"
      ? "% of volume"
      : "flat ₹";

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-ink-900">{scheme.name}</h3>
            <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "active" : "inactive"}</Badge>
            <Badge variant="brand">{RAIL_LABEL[scheme.rail]}</Badge>
            <Badge variant="warning">{scheme.tierCount} tiers</Badge>
            <Badge variant="default">
              <Users className="h-3 w-3" /> {scheme.userCount} mapped
            </Badge>
            <Badge variant="accent">{REWARD_LABEL[scheme.rewardType]}</Badge>
          </div>
          {scheme.description && <p className="mt-0.5 truncate text-xs text-ink-500">{scheme.description}</p>}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setTierModal({ editing: null });
              setExpanded(true);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-amber-600 hover:bg-amber-50"
            title="Add reward tier"
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAssignOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-lg text-violet-600 hover:bg-violet-50"
            title="Assign users"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={() => setRunOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50"
            title="Run / preview payout"
          >
            <PlayCircle className="h-4 w-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <button
            onClick={toggleActive}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-50 disabled:opacity-50"
            title={scheme.active ? "Deactivate" : "Activate"}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
            title="Delete incentive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-50"
            title={expanded ? "Collapse" : "Expand"}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-ink-100 bg-ink-50/30 px-5 py-4">
          {loadingDetail && tiers === null ? (
            <p className="py-4 text-center text-sm text-ink-500">Loading…</p>
          ) : (
            <>
              {/* Reward tiers */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-amber-600" />
                  <h4 className="text-sm font-semibold text-amber-600">Reward tiers ({tiers?.length ?? 0})</h4>
                </div>
                {tiers && tiers.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
                    <table className="w-full min-w-max text-sm">
                      <thead className="bg-ink-50/60 text-left text-[11px] uppercase tracking-wider text-ink-500">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Tier</th>
                          <th className="px-4 py-2 font-semibold">Monthly volume band</th>
                          <th className="px-4 py-2 text-right font-semibold">T+1 reward ({baseLabel})</th>
                          <th className="px-4 py-2 text-right font-semibold">Instant reward</th>
                          <th className="px-4 py-2 text-center font-semibold">Status</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100 text-ink-800">
                        {tiers.map((t) => (
                          <tr key={t.id} className="hover:bg-amber-50/30">
                            <td className="px-4 py-2.5 font-medium">{t.label ?? "—"}</td>
                            <td className="px-4 py-2.5">{fmtBand(t.minAmount, t.maxAmount)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                              {fmtReward(t.rewardType, t.rewardValue)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-sky-700">
                              {t.rewardType === "FLAT" ? (
                                <span className="text-ink-400">—</span>
                              ) : t.rewardValueT0 > 0 ? (
                                fmtReward(t.rewardType, t.rewardValueT0)
                              ) : (
                                <span className="text-ink-400" title="Instant rewarded at the same rate as T+1">
                                  {fmtReward(t.rewardType, t.rewardValue)}
                                  <span className="ml-1 text-[10px]">(=T+1)</span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge variant={t.active ? "success" : "danger"}>{t.active ? "On" : "Off"}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setTierModal({ editing: t })}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
                                  title="Edit tier"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteTier(t)}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                                  title="Delete tier"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-ink-200 bg-white px-3 py-4 text-center text-sm text-ink-500">
                    No tiers yet — add one (e.g. ₹20 lakh → 0.10%).
                  </p>
                )}
              </div>

              {/* Assigned users with per-user overrides */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-violet-600" />
                  <h4 className="text-sm font-semibold text-violet-600">Assigned users ({assigned.length})</h4>
                </div>
                {assigned.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
                    <table className="w-full min-w-max text-sm">
                      <thead className="bg-ink-50/60 text-left text-[11px] uppercase tracking-wider text-ink-500">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Name</th>
                          <th className="px-4 py-2 font-semibold">Role</th>
                          <th className="px-4 py-2 text-right font-semibold">Threshold override</th>
                          <th className="px-4 py-2 text-right font-semibold">T+1 rate override</th>
                          <th className="px-4 py-2 text-right font-semibold">Instant rate override</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100 text-ink-800">
                        {assigned.map((u) => (
                          <tr key={u.id} className="hover:bg-violet-50/30">
                            <td className="px-4 py-2.5">
                              <span className="block font-medium text-ink-900">{u.name}</span>
                              <span className="block text-xs text-ink-400">{u.email}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="brand">{u.role.replace(/_/g, " ")}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {u.minAmount != null ? (
                                <span className="font-semibold text-ink-900">{fmtINR(u.minAmount)}</span>
                              ) : (
                                <span className="text-ink-400">default</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {u.rewardValue != null ? (
                                <span className="font-semibold text-ink-900">{(u.rewardValue * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%</span>
                              ) : (
                                <span className="text-ink-400">default</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {u.rewardValueT0 != null ? (
                                <span className="font-semibold text-sky-700">{(u.rewardValueT0 * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%</span>
                              ) : (
                                <span className="text-ink-400">default</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-ink-200 bg-white px-3 py-4 text-center text-sm text-ink-500">
                    No users assigned. Use the people icon to assign retailers and set per-user thresholds.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tierModal && (
        <TierModal
          schemeId={scheme.id}
          scheme={scheme}
          editing={tierModal.editing}
          onClose={() => setTierModal(null)}
          onSaved={(msg) => {
            setTierModal(null);
            notify(msg, true);
            loadDetail();
            onChanged();
          }}
        />
      )}

      {assignOpen && (
        <AssignModal
          scheme={scheme}
          onClose={() => setAssignOpen(false)}
          onChanged={(msg) => {
            notify(msg, true);
            onChanged();
          }}
          onError={(msg) => notify(msg, false)}
        />
      )}

      {runOpen && (
        <RunModal scheme={scheme} onClose={() => setRunOpen(false)} notify={notify} onExecuted={onChanged} />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={busy}
        tone="danger"
        title={`Delete incentive "${scheme.name}"?`}
        description="Tiers and assignments are removed. If reward payouts already exist, it is deactivated instead."
        confirmLabel="Delete"
        onConfirm={deleteScheme}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { fetchWithStepUp } = useStepUp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rail, setRail] = useState<Rail>("QR");
  const [rewardType, setRewardType] = useState<RewardType>("CASHBACK_ON_MDR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (name.trim().length < 2) {
      setError("Enter a name (min 2 characters).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetchWithStepUp("/api/admin/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          rail,
          rewardType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Create failed");
      onSaved("Incentive created — add reward tiers and assign users.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Gift className="h-5 w-5 text-amber-600" /> Create incentive
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. QR Monthly Reverse Cashback" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short note" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rail</Label>
              <Select value={rail} onChange={(e) => setRail(e.target.value as Rail)}>
                {(Object.keys(RAIL_LABEL) as Rail[]).map((r) => (
                  <option key={r} value={r}>
                    {RAIL_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Reward basis</Label>
              <Select value={rewardType} onChange={(e) => setRewardType(e.target.value as RewardType)}>
                {(Object.keys(REWARD_LABEL) as RewardType[]).map((r) => (
                  <option key={r} value={r}>
                    {REWARD_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-ink-400">
            {rewardType === "CASHBACK_ON_MDR"
              ? "Reward = a % of the MDR the user actually paid that month on this rail — a true reverse cashback."
              : rewardType === "CASHBACK_ON_VOLUME"
              ? "Reward = a % of the user's gross monthly volume on this rail."
              : "Reward = a fixed ₹ amount once the volume tier is reached."}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier modal
// ---------------------------------------------------------------------------

function TierModal({
  schemeId,
  scheme,
  editing,
  onClose,
  onSaved,
}: {
  schemeId: string;
  scheme: Scheme;
  editing: Tier | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { fetchWithStepUp } = useStepUp();
  const isEdit = !!editing;
  // FLAT reward schemes use ₹ tiers; cashback schemes use % tiers.
  const defaultRewardType: RateType = scheme.rewardType === "FLAT" ? "FLAT" : "PERCENT";
  const [label, setLabel] = useState(editing?.label ?? "");
  const [minAmount, setMinAmount] = useState(String(editing?.minAmount ?? 2000000));
  const [maxAmount, setMaxAmount] = useState(String(editing?.maxAmount ?? 5000000));
  const [rewardType, setRewardType] = useState<RateType>(editing?.rewardType ?? defaultRewardType);
  // PERCENT edited as human percent (0.10 = 0.10%), stored as fraction (0.0010).
  const [rewardValue, setRewardValue] = useState(
    String(editing ? (editing.rewardType === "PERCENT" ? editing.rewardValue * 100 : editing.rewardValue) : 0.1)
  );
  // Instant (T+0) rate — blank/0 means "same as T+1". Percent schemes only.
  const [rewardValueT0, setRewardValueT0] = useState(
    editing && editing.rewardValueT0 > 0
      ? String(editing.rewardType === "PERCENT" ? editing.rewardValueT0 * 100 : editing.rewardValueT0)
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toStored(type: RateType, raw: string): number {
    const n = Number(raw);
    if (!isFinite(n) || n < 0) return 0;
    return type === "PERCENT" ? n / 100 : n;
  }

  async function submit() {
    setError(null);
    const min = Number(minAmount);
    const max = Number(maxAmount);
    if (!isFinite(min) || !isFinite(max) || min < 0 || max <= min) {
      setError("Enter a valid volume band (max must be greater than min).");
      return;
    }
    const rv = toStored(rewardType, rewardValue);
    if (rv <= 0) {
      setError("Enter a reward value greater than 0.");
      return;
    }
    // Instant rate: blank ⇒ 0 (falls back to T+1). FLAT tiers ignore it.
    const rvT0 =
      rewardType === "FLAT" || rewardValueT0.trim() === ""
        ? 0
        : toStored(rewardType, rewardValueT0);
    setSaving(true);
    const body = {
      label: label.trim() || null,
      minAmount: min,
      maxAmount: max,
      rewardType,
      rewardValue: rv,
      rewardValueT0: rvT0,
    };
    try {
      const res = await fetchWithStepUp(`/api/admin/incentives/${schemeId}/tiers`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { tierId: editing!.id, ...body } : body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
      onSaved(isEdit ? "Tier updated." : "Tier added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const baseHint =
    scheme.rewardType === "CASHBACK_ON_MDR"
      ? "of the MDR the user paid that month"
      : scheme.rewardType === "CASHBACK_ON_VOLUME"
      ? "of the user's monthly volume"
      : "flat reward";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Layers className="h-5 w-5 text-amber-600" /> {isEdit ? "Edit reward tier" : "Add reward tier"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div>
            <Label>Tier label (optional)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Silver / Gold / Platinum" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monthly volume from (₹)</Label>
              <Input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            </div>
            <div>
              <Label>Up to (₹)</Label>
              <Input type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">Reward</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={rewardType}
                  onChange={(e) => setRewardType(e.target.value as RateType)}
                  disabled={scheme.rewardType === "FLAT"}
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FLAT">Flat (₹)</option>
                </Select>
              </div>
              <div>
                <Label>{rewardType === "PERCENT" ? "T+1 rate (%)" : "Amount (₹)"}</Label>
                <Input type="number" min={0} step="0.0001" value={rewardValue} onChange={(e) => setRewardValue(e.target.value)} />
              </div>
            </div>
            {rewardType === "PERCENT" && (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/50 p-3">
                <Label>Instant (T+0) rate (%) — leave blank to match the T+1 rate</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={rewardValueT0}
                  onChange={(e) => setRewardValueT0(e.target.value)}
                  placeholder={`Same as T+1 (${Number(rewardValue) || 0}%)`}
                />
                <p className="mt-1 text-[11px] text-sky-700">
                  Instant-settled volume is rewarded INDEPENDENTLY at this rate — its own wallet credit and its own
                  report line. Blank ⇒ instant earns the same rate as T+1.
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-500">
              {rewardType === "PERCENT"
                ? `Once a user's monthly ${RAIL_LABEL[scheme.rail]} volume falls in this band, T+1 business earns ${Number(rewardValue) || 0}% and instant business earns ${rewardValueT0.trim() === "" ? Number(rewardValue) || 0 : Number(rewardValueT0) || 0}% ${baseHint}.`
                : `Once the band is reached, the user earns a flat ${fmtINR(Number(rewardValue) || 0)}.`}{" "}
              Enter percentages as human values (0.10 = 0.10%).
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save tier
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assign modal (with per-user threshold / rate override)
// ---------------------------------------------------------------------------

function AssignModal({
  scheme,
  onClose,
  onChanged,
  onError,
}: {
  scheme: Scheme;
  onClose: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { fetchWithStepUp } = useStepUp();
  const [assigned, setAssigned] = useState<AssignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleUsers, setVisibleUsers] = useState<PickerUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [editUser, setEditUser] = useState<AssignedUser | null>(null);

  const assignedIds = useMemo(() => assigned.map((u) => u.id), [assigned]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/incentives/${scheme.id}`);
      const data = await res.json();
      if (res.ok) setAssigned(data.assignedUsers ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [scheme.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetchWithStepUp("/api/admin/incentives/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeId: scheme.id, op: "assign", userIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Assign failed");
      onChanged(`Assigned to ${data.updated} user(s).`);
      load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function unassign(userId: string) {
    try {
      const res = await fetchWithStepUp("/api/admin/incentives/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeId: scheme.id, op: "unassign", userIds: [userId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Unassign failed");
      onChanged("User removed.");
      load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unassign failed");
    }
  }

  const ROLE_BADGE: Record<string, string> = {
    RETAILER: "RT",
    DISTRIBUTOR: "DT",
    MASTER_DISTRIBUTOR: "MD",
    SUPER_DISTRIBUTOR: "SD",
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Users className="h-5 w-5 text-violet-600" /> Assign — {scheme.name}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs text-ink-400">
            Assign users to this incentive. Each user can have a custom unlock threshold and rate — the tier defaults
            are just the starting point (₹20 lakh in the example, changeable per user).
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Available users</p>
              {visibleUsers.length > 0 && (
                <Button size="sm" onClick={() => assign(visibleUsers.map((u) => u.id))} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} Assign all ({visibleUsers.length})
                </Button>
              )}
            </div>
            <AssignUserPicker
              autoFocus
              excludeUserIds={assignedIds}
              onSelect={(u) => assign([u.id])}
              onVisibleUsersChange={setVisibleUsers}
              listMaxHeightClass="max-h-48"
              emptyLabel="All users are assigned."
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">
              Currently assigned ({assigned.length})
            </p>
            {loading ? (
              <p className="py-4 text-center text-sm text-ink-400">Loading…</p>
            ) : assigned.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-500">
                No users assigned yet.
              </p>
            ) : (
              <ul className="max-h-56 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100">
                {assigned.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">
                        {u.name}
                        <span className="ml-1.5 inline-block rounded bg-ink-100 px-1 py-0.5 text-[10px] font-semibold text-ink-600">
                          {ROLE_BADGE[u.role] ?? u.role}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-ink-400">
                        {u.minAmount != null ? `Unlock ${fmtINR(u.minAmount)}` : "Default threshold"}
                        {u.rewardValue != null ? ` · T+1 ${(u.rewardValue * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%` : ""}
                        {u.rewardValueT0 != null ? ` · T+0 ${(u.rewardValueT0 * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => setEditUser(u)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Override
                      </button>
                      <button onClick={() => unassign(u.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {editUser && (
        <OverrideModal
          scheme={scheme}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={(msg) => {
            setEditUser(null);
            onChanged(msg);
            load();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-user override modal
// ---------------------------------------------------------------------------

function OverrideModal({
  scheme,
  user,
  onClose,
  onSaved,
  onError,
}: {
  scheme: Scheme;
  user: AssignedUser;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { fetchWithStepUp } = useStepUp();
  const [minAmount, setMinAmount] = useState(user.minAmount != null ? String(user.minAmount) : "");
  const [rewardPct, setRewardPct] = useState(user.rewardValue != null ? String(user.rewardValue * 100) : "");
  const [rewardPctT0, setRewardPctT0] = useState(
    user.rewardValueT0 != null ? String(user.rewardValueT0 * 100) : ""
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const minVal = minAmount.trim() === "" ? null : Number(minAmount);
    const rateVal = rewardPct.trim() === "" ? null : Number(rewardPct) / 100;
    const rateValT0 = rewardPctT0.trim() === "" ? null : Number(rewardPctT0) / 100;
    if (minVal != null && (!isFinite(minVal) || minVal < 0)) {
      onError("Enter a valid threshold.");
      setSaving(false);
      return;
    }
    try {
      const res = await fetchWithStepUp("/api/admin/incentives/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemeId: scheme.id,
          op: "override",
          userId: user.id,
          minAmount: minVal,
          rewardValue: rateVal,
          rewardValueT0: rateValT0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
      onSaved(`Override saved for ${user.name}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-ink-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Settings2 className="h-5 w-5 text-brand-600" /> Override — {user.name}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <Label>Unlock threshold (₹) — leave blank for tier default</Label>
            <Input
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="e.g. 2000000 for ₹20 lakh"
            />
          </div>
          <div>
            <Label>T+1 reward rate (%) — leave blank for tier default</Label>
            <Input
              type="number"
              min={0}
              step="0.0001"
              value={rewardPct}
              onChange={(e) => setRewardPct(e.target.value)}
              placeholder="e.g. 0.10 for 0.10%"
            />
          </div>
          <div>
            <Label>Instant (T+0) reward rate (%) — leave blank for tier default</Label>
            <Input
              type="number"
              min={0}
              step="0.0001"
              value={rewardPctT0}
              onChange={(e) => setRewardPctT0(e.target.value)}
              placeholder="e.g. 0.05 for 0.05%"
            />
          </div>
          <p className="text-xs text-ink-400">
            These override the {scheme.name} tier for this user only. The threshold changes when they unlock the
            lowest reward tier; each rate replaces the tier rate for its own settlement leg (instant vs T+1), which are
            rewarded and reported independently.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />} Save override
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run / preview modal
// ---------------------------------------------------------------------------

type LegTally = { paid: number; skipped: number; failed: number; rewarded: number };

type RunResult = {
  periodKey: string;
  schemes: number;
  users: number;
  paid: number;
  skipped: number;
  failed: number;
  totalRewarded: number;
  legs: { instant: LegTally; t1: LegTally };
};

type LegView = "BOTH" | "INSTANT" | "T1";

function RunModal({
  scheme,
  onClose,
  notify,
  onExecuted,
}: {
  scheme: Scheme;
  onClose: () => void;
  notify: (msg: string, ok: boolean) => void;
  onExecuted: () => void;
}) {
  const { fetchWithStepUp } = useStepUp();
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [periodKey, setPeriodKey] = useState(defaultPeriod);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [legView, setLegView] = useState<LegView>("BOTH");

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetchWithStepUp("/api/admin/incentives/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodKey, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Run failed");
      setPreview(data.result);
      if (!dryRun) {
        notify(`Paid ${data.result.paid} reward(s), ₹${data.result.totalRewarded.toLocaleString("en-IN")}.`, true);
        onExecuted();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Run failed", false);
    } finally {
      setBusy(false);
      setConfirmExecute(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <PlayCircle className="h-5 w-5 text-emerald-600" /> Run payout
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs text-ink-400">
            Runs the month-end engine across <span className="font-semibold">all active incentives</span> for the chosen
            period. Preview first; execution is idempotent (a user/scheme/month is never paid twice).
          </p>
          <div>
            <Label>Period (YYYY-MM)</Label>
            <Input value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} placeholder="2026-09" />
          </div>

          {preview &&
            (() => {
              const tally: LegTally =
                legView === "INSTANT"
                  ? preview.legs.instant
                  : legView === "T1"
                  ? preview.legs.t1
                  : {
                      paid: preview.paid,
                      skipped: preview.skipped,
                      failed: preview.failed,
                      rewarded: preview.totalRewarded,
                    };
              const TABS: { id: LegView; label: string }[] = [
                { id: "BOTH", label: "Both" },
                { id: "INSTANT", label: "Instant (T+0)" },
                { id: "T1", label: "T+1" },
              ];
              return (
                <div className="space-y-2">
                  <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setLegView(t.id)}
                        className={`rounded-md px-2.5 py-1 font-semibold transition ${
                          legView === t.id ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-ink-50"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 bg-ink-50/40 p-3 text-sm">
                    <div>Rewarded payouts</div>
                    <div className="text-right font-semibold text-emerald-700">{tally.paid}</div>
                    <div>Skipped (no tier / below min)</div>
                    <div className="text-right font-semibold">{tally.skipped}</div>
                    <div>Failed</div>
                    <div className="text-right font-semibold text-rose-600">{tally.failed}</div>
                    <div>Total reward</div>
                    <div className="text-right font-bold text-brand-700">
                      ₹{tally.rewarded.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-400">
                    Instant (T+0) and T+1 rewards are credited and recorded independently — {preview.users} user(s)
                    across {preview.schemes} active incentive(s).
                  </p>
                </div>
              );
            })()}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={() => run(true)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Preview
          </Button>
          <Button onClick={() => setConfirmExecute(true)} disabled={busy || !preview}>
            <PlayCircle className="h-4 w-4" /> Execute payout
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmExecute}
        onClose={() => setConfirmExecute(false)}
        busy={busy}
        tone="danger"
        title={`Execute rewards for ${periodKey}?`}
        description="This credits real money to retailer wallets. Idempotent — already-paid users this period are skipped."
        confirmLabel="Execute payout"
        onConfirm={() => run(false)}
      />
    </div>
  );
}
