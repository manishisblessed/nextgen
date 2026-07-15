"use client";

/**
 * Scheme Management (Same Day style) — every scheme is an expandable card
 * with an icon strip: one colored icon per service family (BBPS, Recharge,
 * DMT, ...) that opens an "add slab" modal scoped to that family, plus
 * manage/toggle/delete actions. Expanding a card shows per-family slab
 * tables. MDR schemes get the same treatment with company/card-dimension
 * rate rows and T+1/T+0 values.
 *
 * Cascade model: a slab carries ONE charge + ONE commission (what the
 * assigned user earns). There are no per-tier commission columns — parents
 * earn the margin between their derived scheme and their child's.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Label, Select } from "@/components/ui/Input";
import { SERVICE_FAMILIES, familyOf, type ServiceFamily } from "@/lib/scheme/constants";
import {
  RefreshCw,
  Plus,
  Layers,
  Star,
  Users,
  ChevronDown,
  Loader2,
  X,
  Pencil,
  Trash2,
  Power,
  CreditCard,
  Smartphone,
  Banknote,
  Send,
  Fingerprint,
  Wallet,
  Plane,
  FileText,
  TrendingUp,
  Settings2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (JSON shapes from the admin APIs)
// ---------------------------------------------------------------------------

type RateType = "FLAT" | "PERCENT";

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  ownerId: string | null;
  slabCount: number;
  userCount: number;
};

type Slab = {
  id: string;
  service: string;
  provider: string | null;
  minAmount: number;
  maxAmount: number;
  chargeType: RateType;
  chargeValue: number;
  commissionType: RateType;
  commissionValue: number;
  active: boolean;
};

type MdrScheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  slabs: number;
  users: number;
};

type MdrSlab = {
  id: string;
  serviceKind: string;
  paymentMode: string;
  company: string | null;
  cardType: string | null;
  brandType: string | null;
  classification: string | null;
  minAmount: number;
  maxAmount: number;
  mdrType: RateType;
  mdrValue: number;
  mdrValueT0: number;
  active: boolean;
};

type Meta = {
  providersByKind: Record<string, Array<{ provider: string; name: string }>>;
  posCompanies: string[];
};

// ---------------------------------------------------------------------------
// Family icon strip config
// ---------------------------------------------------------------------------

const FAMILY_ICONS: Record<string, { icon: typeof CreditCard; className: string; hover: string }> = {
  BBPS: { icon: CreditCard, className: "text-blue-600", hover: "hover:bg-blue-50" },
  RECHARGE: { icon: Smartphone, className: "text-amber-600", hover: "hover:bg-amber-50" },
  DMT: { icon: Banknote, className: "text-emerald-600", hover: "hover:bg-emerald-50" },
  UPI: { icon: Send, className: "text-cyan-600", hover: "hover:bg-cyan-50" },
  AEPS: { icon: Fingerprint, className: "text-teal-600", hover: "hover:bg-teal-50" },
  WALLET: { icon: Wallet, className: "text-violet-600", hover: "hover:bg-violet-50" },
  TRAVEL: { icon: Plane, className: "text-pink-600", hover: "hover:bg-pink-50" },
  OTHER: { icon: FileText, className: "text-ink-500", hover: "hover:bg-ink-50" },
};

const CARD_TYPES = ["CREDIT", "DEBIT", "PREPAID"];
const BRAND_TYPES = ["VISA", "MASTERCARD", "RUPAY", "AMEX", "DINERS"];
const CLASSIFICATIONS = ["PLATINUM", "GOLD", "CLASSIC", "BUSINESS", "STANDARD", "SIGNATURE"];
const PAYMENT_MODES = ["*", "CARD", "UPI", "NFC", "BHARATQR"];

function fmtRate(type: RateType, value: number): string {
  if (value === 0) return "—";
  return type === "FLAT" ? `₹${value.toLocaleString("en-IN")}` : `${(value * 100).toFixed(2)}%`;
}

function fmtBand(min: number, max: number): string {
  return `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchemeManagementPage() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [mdrSchemes, setMdrSchemes] = useState<MdrScheme[]>([]);
  const [meta, setMeta] = useState<Meta>({ providersByKind: {}, posCompanies: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [createOpen, setCreateOpen] = useState<null | "SCHEME" | "MDR">(null);

  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes, metaRes] = await Promise.all([
        fetch("/api/admin/schemes"),
        fetch("/api/admin/mdr-schemes"),
        fetch("/api/admin/schemes/meta"),
      ]);
      const sData = await sRes.json();
      const mData = await mRes.json();
      const metaData = await metaRes.json();
      if (Array.isArray(sData.schemes)) setSchemes(sData.schemes);
      if (Array.isArray(mData.schemes)) setMdrSchemes(mData.schemes);
      if (metaData.providersByKind)
        setMeta({ providersByKind: metaData.providersByKind, posCompanies: metaData.posCompanies ?? [] });
    } catch {
      notify("Failed to load schemes", false);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleSchemes = useMemo(
    () =>
      schemes.filter(
        (s) =>
          (statusFilter === "all" || s.active) &&
          (!query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [schemes, query, statusFilter]
  );
  const visibleMdr = useMemo(
    () =>
      mdrSchemes.filter(
        (s) =>
          (statusFilter === "all" || s.active) &&
          (!query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [mdrSchemes, query, statusFilter]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Scheme Management"
        description="Manage platform schemes with per-service slabs and company-wise MDR rates. Click a service icon on a card to add a slab of that type."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen("MDR")}>
              <TrendingUp className="h-4 w-4" /> New MDR scheme
            </Button>
            <Button onClick={() => setCreateOpen("SCHEME")}>
              <Plus className="h-4 w-4" /> New scheme
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search schemes…" />
        </div>
        <Select
          className="w-32"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
        >
          <option value="active">Active</option>
          <option value="all">All</option>
        </Select>
      </div>

      {/* Service schemes */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-600" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink-600">
            Service Schemes ({visibleSchemes.length})
          </h2>
        </div>
        {loading && schemes.length === 0 ? (
          <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center text-sm text-ink-500">
            Loading schemes…
          </div>
        ) : visibleSchemes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-500">
            No schemes found. Create one to configure charges and commissions.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSchemes.map((s) => (
              <SchemeCard key={s.id} scheme={s} meta={meta} notify={notify} onChanged={load} />
            ))}
          </div>
        )}
      </section>

      {/* MDR schemes */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-600" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink-600">
            MDR Schemes ({visibleMdr.length})
          </h2>
        </div>
        {visibleMdr.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-500">
            No MDR schemes found. MDR schemes price POS/PG/QR/UPI acquiring with company &amp; card-wise rates.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMdr.map((s) => (
              <MdrSchemeCard key={s.id} scheme={s} meta={meta} notify={notify} onChanged={load} />
            ))}
          </div>
        )}
      </section>

      {createOpen && (
        <CreateSchemeModal
          kind={createOpen}
          onClose={() => setCreateOpen(null)}
          onSaved={(msg) => {
            setCreateOpen(null);
            notify(msg, true);
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service scheme card
// ---------------------------------------------------------------------------

function SchemeCard({
  scheme,
  meta,
  notify,
  onChanged,
}: {
  scheme: Scheme;
  meta: Meta;
  notify: (msg: string, ok: boolean) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [slabs, setSlabs] = useState<Slab[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [slabModal, setSlabModal] = useState<{ family: ServiceFamily; editing: Slab | null } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/schemes/${scheme.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load slabs");
      setSlabs(data.scheme.slabs ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load slabs", false);
    } finally {
      setLoadingDetail(false);
    }
  }, [scheme.id, notify]);

  useEffect(() => {
    if (expanded && slabs === null) loadDetail();
  }, [expanded, slabs, loadDetail]);

  async function toggleActive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/schemes/${scheme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !scheme.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      notify(scheme.active ? "Scheme deactivated." : "Scheme activated.", true);
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
      const res = await fetch(`/api/admin/schemes/${scheme.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Delete failed");
      notify("Scheme deactivated.", true);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function deleteSlab(slab: Slab) {
    try {
      const res = await fetch(`/api/admin/schemes/${scheme.id}/slabs/${slab.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      notify("Slab removed.", true);
      loadDetail();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    }
  }

  // Group loaded slabs by family for the expanded sections.
  const grouped = useMemo(() => {
    if (!slabs) return [];
    const map = new Map<string, Slab[]>();
    for (const s of slabs) {
      const fam = familyOf(s.service).key;
      const arr = map.get(fam) ?? [];
      arr.push(s);
      map.set(fam, arr);
    }
    return SERVICE_FAMILIES.filter((f) => map.has(f.key)).map(
      (f) => [f, (map.get(f.key) ?? []).sort((a, b) => a.service.localeCompare(b.service) || a.minAmount - b.minAmount)] as const
    );
  }, [slabs]);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-500 text-white">
          <Settings2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-ink-900">{scheme.name}</h3>
            {scheme.isDefault && (
              <Badge variant="accent">
                <Star className="h-3 w-3" /> Default
              </Badge>
            )}
            <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "active" : "inactive"}</Badge>
            <Badge variant="brand">{scheme.slabCount} slabs</Badge>
            <Badge variant="default">
              <Users className="h-3 w-3" /> {scheme.userCount} mapped
            </Badge>
            <Badge variant="default">{scheme.ownerId ? "Derived" : "Admin"}</Badge>
          </div>
          {scheme.description && <p className="mt-0.5 truncate text-xs text-ink-500">{scheme.description}</p>}
        </div>

        {/* Icon strip: one icon per service family + manage actions */}
        <div className="flex items-center gap-0.5">
          {SERVICE_FAMILIES.map((f) => {
            const cfg = FAMILY_ICONS[f.key];
            const Icon = cfg.icon;
            return (
              <button
                key={f.key}
                onClick={() => {
                  setSlabModal({ family: f, editing: null });
                  setExpanded(true);
                }}
                className={`grid h-8 w-8 place-items-center rounded-lg ${cfg.className} ${cfg.hover}`}
                title={`Add ${f.label} slab`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <Link
            href={`/dashboard/admin/schemes/${scheme.id}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-violet-600 hover:bg-violet-50"
            title="Assign to users / full editor"
          >
            <Users className="h-4 w-4" />
          </Link>
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
            title="Delete scheme"
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

      {/* Expanded per-family slab sections */}
      {expanded && (
        <div className="space-y-4 border-t border-ink-100 bg-ink-50/30 px-5 py-4">
          {loadingDetail && slabs === null ? (
            <p className="py-4 text-center text-sm text-ink-500">Loading slabs…</p>
          ) : grouped.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-500">
              No slabs configured yet — use the icons above to add per-service slabs.
            </p>
          ) : (
            grouped.map(([family, list]) => {
              const cfg = FAMILY_ICONS[family.key];
              const Icon = cfg.icon;
              return (
                <div key={family.key}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${cfg.className}`} />
                    <h4 className={`text-sm font-semibold ${cfg.className}`}>
                      {family.label} ({list.length})
                    </h4>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
                    <table className="w-full min-w-max text-sm">
                      <thead className="bg-ink-50/60 text-left text-[11px] uppercase tracking-wider text-ink-500">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Service</th>
                          <th className="px-4 py-2 font-semibold">Provider</th>
                          <th className="px-4 py-2 font-semibold">Slab</th>
                          <th className="px-4 py-2 text-right font-semibold">Charge</th>
                          <th className="px-4 py-2 text-right font-semibold">Commission</th>
                          <th className="px-4 py-2 text-center font-semibold">Status</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100 text-ink-800">
                        {list.map((s) => (
                          <tr key={s.id} className="hover:bg-brand-50/30">
                            <td className="px-4 py-2.5 font-medium">{s.service.replace(/_/g, " ")}</td>
                            <td className="px-4 py-2.5 text-xs">{s.provider ?? "All"}</td>
                            <td className="px-4 py-2.5">{fmtBand(s.minAmount, s.maxAmount)}</td>
                            <td className="px-4 py-2.5 text-right">{fmtRate(s.chargeType, s.chargeValue)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                              {fmtRate(s.commissionType, s.commissionValue)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge variant={s.active ? "success" : "danger"}>{s.active ? "On" : "Off"}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setSlabModal({ family, editing: s })}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
                                  title="Edit slab"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteSlab(s)}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                                  title="Delete slab"
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
                </div>
              );
            })
          )}
        </div>
      )}

      {slabModal && (
        <SlabModal
          schemeId={scheme.id}
          family={slabModal.family}
          editing={slabModal.editing}
          providers={meta.providersByKind[slabModal.family.routeKind] ?? []}
          onClose={() => setSlabModal(null)}
          onSaved={(msg) => {
            setSlabModal(null);
            notify(msg, true);
            loadDetail();
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={busy}
        tone="danger"
        title={`Delete scheme "${scheme.name}"?`}
        description="The scheme is deactivated (soft delete). Users must be unassigned first."
        confirmLabel="Delete"
        onConfirm={deleteScheme}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slab modal (scoped to a service family, with provider dropdown)
// ---------------------------------------------------------------------------

function SlabModal({
  schemeId,
  family,
  editing,
  providers,
  onClose,
  onSaved,
}: {
  schemeId: string;
  family: ServiceFamily;
  editing: Slab | null;
  providers: Array<{ provider: string; name: string }>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!editing;
  const [service, setService] = useState<string>(editing?.service ?? family.services[0]);
  const [provider, setProvider] = useState<string>(editing?.provider ?? "");
  const [minAmount, setMinAmount] = useState(String(editing?.minAmount ?? 0));
  const [maxAmount, setMaxAmount] = useState(String(editing?.maxAmount ?? 100000));
  const [chargeType, setChargeType] = useState<RateType>(editing?.chargeType ?? "FLAT");
  // PERCENT edited as human percent (0.5 = 0.5%), stored as fraction (0.005).
  const [chargeValue, setChargeValue] = useState(
    String(editing ? (editing.chargeType === "PERCENT" ? editing.chargeValue * 100 : editing.chargeValue) : 0)
  );
  const [commissionType, setCommissionType] = useState<RateType>(editing?.commissionType ?? "FLAT");
  const [commissionValue, setCommissionValue] = useState(
    String(editing ? (editing.commissionType === "PERCENT" ? editing.commissionValue * 100 : editing.commissionValue) : 0)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = FAMILY_ICONS[family.key];
  const Icon = cfg.icon;

  function toStored(type: RateType, raw: string): number {
    const n = Number(raw);
    if (!isFinite(n) || n < 0) return 0;
    return type === "PERCENT" ? n / 100 : n;
  }

  async function submit() {
    setError(null);
    const min = Number(minAmount);
    const max = Number(maxAmount);
    if (!isFinite(min) || !isFinite(max) || min < 0 || max < min) {
      setError("Enter a valid amount range.");
      return;
    }
    setSaving(true);

    const payload: Record<string, unknown> = {
      provider: provider || null,
      minAmount: min,
      maxAmount: max,
      chargeType,
      chargeValue: toStored(chargeType, chargeValue),
      commissionType,
      commissionValue: toStored(commissionType, commissionValue),
    };
    if (!isEdit) payload.service = service;

    try {
      const url = isEdit
        ? `/api/admin/schemes/${schemeId}/slabs/${editing!.id}`
        : `/api/admin/schemes/${schemeId}/slabs`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
      onSaved(isEdit ? "Slab updated." : "Slab added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-100 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Icon className={`h-5 w-5 ${cfg.className}`} />
            {isEdit ? `Edit ${family.label} slab` : `Add ${family.label} slab`}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Service</Label>
              <Select value={service} onChange={(e) => setService(e.target.value)} disabled={isEdit}>
                {family.services.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">All providers</option>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.name} ({p.provider})
                  </option>
                ))}
                {/* Keep an unknown/legacy provider selectable while editing */}
                {editing?.provider && !providers.some((p) => p.provider === editing.provider) && (
                  <option value={editing.provider}>{editing.provider}</option>
                )}
              </Select>
              <p className="mt-1 text-xs text-ink-400">
                A provider-specific slab wins over &quot;All providers&quot; for the same band.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Min amount (₹)</Label>
              <Input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            </div>
            <div>
              <Label>Max amount (₹)</Label>
              <Input type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">Customer charge</p>
              <Select value={chargeType} onChange={(e) => setChargeType(e.target.value as RateType)}>
                <option value="FLAT">Flat (₹)</option>
                <option value="PERCENT">Percent (%)</option>
              </Select>
              <div className="mt-2">
                <Input type="number" min={0} step="0.0001" value={chargeValue} onChange={(e) => setChargeValue(e.target.value)} />
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-700">User commission</p>
              <Select value={commissionType} onChange={(e) => setCommissionType(e.target.value as RateType)}>
                <option value="FLAT">Flat (₹)</option>
                <option value="PERCENT">Percent (%)</option>
              </Select>
              <div className="mt-2">
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={commissionValue}
                  onChange={(e) => setCommissionValue(e.target.value)}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-ink-400">
            Percent values are entered as human percent (0.5 = 0.5%). The commission is what the ASSIGNED
            user earns — parents up the chain earn the difference between their derived scheme and their
            child&apos;s automatically (cascade model), so no per-tier columns are needed.
          </p>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-100 bg-white px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {isEdit ? "Save configuration" : "Save configuration"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MDR scheme card
// ---------------------------------------------------------------------------

function MdrSchemeCard({
  scheme,
  meta,
  notify,
  onChanged,
}: {
  scheme: MdrScheme;
  meta: Meta;
  notify: (msg: string, ok: boolean) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [slabs, setSlabs] = useState<MdrSlab[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rateModal, setRateModal] = useState<{ editing: MdrSlab | null } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/mdr-schemes/${scheme.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load rates");
      setSlabs(data.scheme.slabs ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load rates", false);
    } finally {
      setLoadingDetail(false);
    }
  }, [scheme.id, notify]);

  useEffect(() => {
    if (expanded && slabs === null) loadDetail();
  }, [expanded, slabs, loadDetail]);

  async function toggleActive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/mdr-schemes/${scheme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !scheme.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      notify(scheme.active ? "MDR scheme deactivated." : "MDR scheme activated.", true);
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
      const res = await fetch(`/api/admin/mdr-schemes/${scheme.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Delete failed");
      notify("MDR scheme deleted.", true);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function deleteSlab(slab: MdrSlab) {
    try {
      const res = await fetch(`/api/admin/mdr-schemes/${scheme.id}/slabs`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slabId: slab.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      notify("MDR rate removed.", true);
      loadDetail();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-ink-900">{scheme.name}</h3>
            {scheme.isDefault && (
              <Badge variant="accent">
                <Star className="h-3 w-3" /> Default
              </Badge>
            )}
            <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "active" : "inactive"}</Badge>
            <Badge variant="brand">{scheme.slabs} rates</Badge>
            <Badge variant="default">
              <Users className="h-3 w-3" /> {scheme.users} mapped
            </Badge>
          </div>
          {scheme.description && <p className="mt-0.5 truncate text-xs text-ink-500">{scheme.description}</p>}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setRateModal({ editing: null });
              setExpanded(true);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-orange-600 hover:bg-orange-50"
            title="Add MDR rate"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <Link
            href="/dashboard/admin/mdr"
            className="grid h-8 w-8 place-items-center rounded-lg text-violet-600 hover:bg-violet-50"
            title="MDR console (assign to users)"
          >
            <Users className="h-4 w-4" />
          </Link>
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
            title="Delete MDR scheme"
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
        <div className="border-t border-ink-100 bg-ink-50/30 px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-semibold text-orange-600">MDR Rates ({slabs?.length ?? scheme.slabs})</h4>
          </div>
          {loadingDetail && slabs === null ? (
            <p className="py-4 text-center text-sm text-ink-500">Loading rates…</p>
          ) : !slabs || slabs.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-500">No MDR rates configured.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-ink-50/60 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Company</th>
                    <th className="px-4 py-2 font-semibold">Kind</th>
                    <th className="px-4 py-2 font-semibold">Mode</th>
                    <th className="px-4 py-2 font-semibold">Card</th>
                    <th className="px-4 py-2 font-semibold">Brand</th>
                    <th className="px-4 py-2 font-semibold">Class</th>
                    <th className="px-4 py-2 font-semibold">Slab</th>
                    <th className="px-4 py-2 text-right font-semibold">MDR T+1</th>
                    <th className="px-4 py-2 text-right font-semibold">MDR T+0</th>
                    <th className="px-4 py-2 text-center font-semibold">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-800">
                  {slabs.map((s) => (
                    <tr key={s.id} className="hover:bg-orange-50/30">
                      <td className="px-4 py-2.5 font-medium">{s.company ?? "All"}</td>
                      <td className="px-4 py-2.5">{s.serviceKind}</td>
                      <td className="px-4 py-2.5">{s.paymentMode === "*" ? "Any" : s.paymentMode}</td>
                      <td className="px-4 py-2.5">{s.cardType ?? "Any"}</td>
                      <td className="px-4 py-2.5">{s.brandType ?? "Any"}</td>
                      <td className="px-4 py-2.5">{s.classification ?? "Any"}</td>
                      <td className="px-4 py-2.5">{fmtBand(s.minAmount, s.maxAmount)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmtRate(s.mdrType, s.mdrValue)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {s.mdrValueT0 > 0 ? fmtRate(s.mdrType, s.mdrValueT0) : "= T+1"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={s.active ? "success" : "danger"}>{s.active ? "On" : "Off"}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setRateModal({ editing: s })}
                            className="grid h-7 w-7 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
                            title="Edit rate"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteSlab(s)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                            title="Delete rate"
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
          )}
        </div>
      )}

      {rateModal && (
        <MdrRateModal
          schemeId={scheme.id}
          editing={rateModal.editing}
          companies={meta.posCompanies}
          onClose={() => setRateModal(null)}
          onSaved={(msg) => {
            setRateModal(null);
            notify(msg, true);
            loadDetail();
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={busy}
        tone="danger"
        title={`Delete MDR scheme "${scheme.name}"?`}
        description="Users must be unassigned before an MDR scheme can be deleted."
        confirmLabel="Delete"
        onConfirm={deleteScheme}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MDR rate modal (company/card dimensions + T+1/T+0)
// ---------------------------------------------------------------------------

function MdrRateModal({
  schemeId,
  editing,
  companies,
  onClose,
  onSaved,
}: {
  schemeId: string;
  editing: MdrSlab | null;
  companies: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!editing;
  const [serviceKind, setServiceKind] = useState(editing?.serviceKind ?? "POS");
  const [company, setCompany] = useState(editing?.company ?? "");
  const [paymentMode, setPaymentMode] = useState(editing?.paymentMode ?? "CARD");
  const [cardType, setCardType] = useState(editing?.cardType ?? "");
  const [brandType, setBrandType] = useState(editing?.brandType ?? "");
  const [classification, setClassification] = useState(editing?.classification ?? "");
  const [minAmount, setMinAmount] = useState(String(editing?.minAmount ?? 0));
  const [maxAmount, setMaxAmount] = useState(String(editing?.maxAmount ?? 1000000));
  const [mdrType, setMdrType] = useState<RateType>(editing?.mdrType ?? "PERCENT");
  // PERCENT edited as human percent (1 = 1%), stored as fraction (0.01).
  const [mdrT1, setMdrT1] = useState(
    String(editing ? (editing.mdrType === "PERCENT" ? editing.mdrValue * 100 : editing.mdrValue) : 0)
  );
  const [mdrT0, setMdrT0] = useState(
    String(editing ? (editing.mdrType === "PERCENT" ? editing.mdrValueT0 * 100 : editing.mdrValueT0) : 0)
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
    if (!isFinite(min) || !isFinite(max) || min < 0 || max <= 0 || max < min) {
      setError("Enter a valid amount range.");
      return;
    }
    setSaving(true);

    const dims = {
      paymentMode,
      company: company || null,
      cardType: cardType || null,
      brandType: brandType || null,
      classification: classification || null,
      minAmount: min,
      maxAmount: max,
      mdrType,
      mdrValue: toStored(mdrType, mdrT1),
      mdrValueT0: toStored(mdrType, mdrT0),
    };

    try {
      const res = await fetch(`/api/admin/mdr-schemes/${schemeId}/slabs`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { slabId: editing!.id, ...dims } : { serviceKind, ...dims }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
      onSaved(isEdit ? "MDR rate updated." : "MDR rate added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-ink-100 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            {isEdit ? "Edit MDR rate" : "Add MDR rate"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Company</Label>
              <Select value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">All Companies</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {editing?.company && !companies.includes(editing.company) && (
                  <option value={editing.company}>{editing.company}</option>
                )}
              </Select>
            </div>
            <div>
              <Label>Rail</Label>
              <Select value={serviceKind} onChange={(e) => setServiceKind(e.target.value)} disabled={isEdit}>
                <option value="POS">POS</option>
                <option value="PG">PG</option>
                <option value="QR">QR</option>
                <option value="UPI">UPI</option>
              </Select>
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m === "*" ? "Any" : m}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Card type</Label>
              <Select value={cardType} onChange={(e) => setCardType(e.target.value)}>
                <option value="">Any</option>
                {CARD_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Brand</Label>
              <Select value={brandType} onChange={(e) => setBrandType(e.target.value)}>
                <option value="">Any</option>
                {BRAND_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                {editing?.brandType && !BRAND_TYPES.includes(editing.brandType) && (
                  <option value={editing.brandType}>{editing.brandType}</option>
                )}
              </Select>
            </div>
            <div>
              <Label>Classification</Label>
              <Select value={classification} onChange={(e) => setClassification(e.target.value)}>
                <option value="">Any</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {editing?.classification && !CLASSIFICATIONS.includes(editing.classification) && (
                  <option value={editing.classification}>{editing.classification}</option>
                )}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Min amount (₹)</Label>
              <Input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            </div>
            <div>
              <Label>Max amount (₹)</Label>
              <Input type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={mdrType} onChange={(e) => setMdrType(e.target.value as RateType)}>
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FLAT">Flat (₹)</option>
                </Select>
              </div>
              <div>
                <Label>{mdrType === "PERCENT" ? "MDR T+1 (%)" : "MDR T+1 (₹)"}</Label>
                <Input type="number" min={0} step="0.0001" value={mdrT1} onChange={(e) => setMdrT1(e.target.value)} />
              </div>
              <div>
                <Label>{mdrType === "PERCENT" ? "MDR T+0 (%)" : "MDR T+0 (₹)"}</Label>
                <Input type="number" min={0} step="0.0001" value={mdrT0} onChange={(e) => setMdrT0(e.target.value)} />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              T+0 applies to instant settlement; leave 0 to use the T+1 rate. Percent entered as human
              percent (1 = 1%). A rate pinned to a company/card wins over &quot;Any&quot; for matching captures.
            </p>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-100 bg-white px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save configuration
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create scheme / MDR scheme modal
// ---------------------------------------------------------------------------

function CreateSchemeModal({
  kind,
  onClose,
  onSaved,
}: {
  kind: "SCHEME" | "MDR";
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (name.trim().length < 2) {
      setError("Enter a scheme name (min 2 characters).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(kind === "SCHEME" ? "/api/admin/schemes" : "/api/admin/mdr-schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Create failed");
      onSaved(kind === "SCHEME" ? "Scheme created — add slabs via the service icons." : "MDR scheme created — add rates.");
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
          <h3 className="font-display text-base font-semibold text-ink-900">
            {kind === "SCHEME" ? "Create scheme" : "Create MDR scheme"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold Retailer Plan" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short note" />
          </div>
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
