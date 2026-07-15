"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers,
  Plus,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  Check,
  Pencil,
  Trash2,
  Info,
  ChevronDown,
  Users,
  CreditCard,
  Smartphone,
  Banknote,
  Send,
  Fingerprint,
  Wallet,
  Plane,
  FileText,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SERVICE_FAMILIES, familyOf, type ServiceFamily } from "@/lib/scheme/constants";

/**
 * My Schemes — SD/MD/DT scheme workspace (cascade model), Same Day style:
 * expandable cards with per-service-family icons and slab tables.
 *
 * Your parent (or admin) assigned you a base scheme: those are YOUR rates.
 * Here you derive schemes for your children by adding margin per slab:
 *   child charge >= your charge, child commission <= your commission,
 *   child MDR >= your MDR. The difference on every transaction is YOUR
 *   commission (2% TDS applies). Bands and dimensions are locked to the
 *   parent scheme — only values change.
 */

type RateType = "FLAT" | "PERCENT";

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
  parentSlabId: string | null;
  active: boolean;
};

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  userCount: number;
  slabs?: Slab[];
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
  parentSlabId: string | null;
  active: boolean;
};

type MdrScheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  userCount: number;
  slabs?: MdrSlab[];
};

const FAMILY_ICONS: Record<string, { icon: typeof CreditCard; className: string }> = {
  BBPS: { icon: CreditCard, className: "text-blue-600" },
  RECHARGE: { icon: Smartphone, className: "text-amber-600" },
  DMT: { icon: Banknote, className: "text-emerald-600" },
  UPI: { icon: Send, className: "text-cyan-600" },
  AEPS: { icon: Fingerprint, className: "text-teal-600" },
  WALLET: { icon: Wallet, className: "text-violet-600" },
  TRAVEL: { icon: Plane, className: "text-pink-600" },
  OTHER: { icon: FileText, className: "text-ink-500" },
};

const fmtRate = (type: RateType, value: number) =>
  type === "PERCENT" ? `${(value * 100).toFixed(2)}%` : `₹${value}`;

const fmtBand = (min: number, max: number) =>
  `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")}`;

/** Group service slabs into ordered family sections. */
function groupByFamily(slabs: Slab[]): Array<readonly [ServiceFamily, Slab[]]> {
  const map = new Map<string, Slab[]>();
  for (const s of slabs) {
    const fam = familyOf(s.service).key;
    (map.get(fam) ?? map.set(fam, []).get(fam)!).push(s);
  }
  return SERVICE_FAMILIES.filter((f) => map.has(f.key)).map(
    (f) =>
      [
        f,
        (map.get(f.key) ?? []).sort(
          (a, b) => a.service.localeCompare(b.service) || a.minAmount - b.minAmount
        ),
      ] as const
  );
}

export default function MySchemesPage() {
  const [tab, setTab] = useState<"commission" | "mdr">("commission");
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState<Scheme | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [mdrBase, setMdrBase] = useState<MdrScheme | null>(null);
  const [mdrSchemes, setMdrSchemes] = useState<MdrScheme[]>([]);
  const [editor, setEditor] = useState<
    | { kind: "commission"; scheme: Scheme | null; focusFamily?: string }
    | { kind: "mdr"; scheme: MdrScheme | null }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/network/schemes").then((r) => r.json()),
        fetch("/api/network/mdr-schemes").then((r) => r.json()),
      ]);
      setBase(a.baseScheme ?? null);
      setSchemes(a.schemes ?? []);
      setMdrBase(b.baseScheme ?? null);
      setMdrSchemes(b.schemes ?? []);
    } catch {
      // network hiccup — keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeBase = tab === "commission" ? base : mdrBase;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network pricing"
        title="My Schemes"
        description="Derive schemes from your own rate-card and assign them to your network. Your margin on every slab becomes your commission (2% TDS applies)."
        actions={
          <>
            <Button
              onClick={() =>
                setEditor(tab === "commission" ? { kind: "commission", scheme: null } : { kind: "mdr", scheme: null })
              }
              disabled={!activeBase}
              title={!activeBase ? "You need a scheme assigned by your parent first" : undefined}
            >
              <Plus className="h-4 w-4" />
              New {tab === "commission" ? "scheme" : "MDR scheme"}
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2">
        {(["commission", "mdr"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === t ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {t === "commission" ? "Service schemes" : "MDR schemes (POS/PG/QR)"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-ink-100 bg-white py-16 text-ink-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading schemes…
        </div>
      ) : !activeBase ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">No {tab === "commission" ? "scheme" : "MDR scheme"} assigned to you yet</p>
            <p className="mt-1">
              Ask your parent (or admin) to assign one. Until then you cannot transact or create
              schemes for your network.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Base scheme (your rates) */}
          <section className="rounded-2xl border border-ink-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-ink-400" />
              <h3 className="font-display text-sm font-semibold text-ink-900">Your rate-card: {activeBase.name}</h3>
              <Badge variant="brand">assigned to you</Badge>
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-500">
              <Info className="h-3.5 w-3.5" />
              These are the rates YOU pay/earn. Schemes you create must charge at least this and give
              commission at most this — the difference is your margin.
            </p>
            {tab === "commission" ? (
              <div className="space-y-4">
                {groupByFamily(base?.slabs ?? []).map(([family, list]) => {
                  const cfg = FAMILY_ICONS[family.key];
                  const Icon = cfg.icon;
                  return (
                    <div key={family.key}>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Icon className={`h-4 w-4 ${cfg.className}`} />
                        <h4 className={`text-sm font-semibold ${cfg.className}`}>
                          {family.label} ({list.length})
                        </h4>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-ink-100">
                        <table className="w-full min-w-max text-left text-sm">
                          <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-400">
                            <tr>
                              <th className="px-3 py-2">Service</th>
                              <th className="px-3 py-2">Provider</th>
                              <th className="px-3 py-2">Band</th>
                              <th className="px-3 py-2 text-right">Your charge</th>
                              <th className="px-3 py-2 text-right">Your commission</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((s) => (
                              <tr key={s.id} className="border-t border-ink-50">
                                <td className="px-3 py-2 font-medium text-ink-900">{s.service.replace(/_/g, " ")}</td>
                                <td className="px-3 py-2 text-xs text-ink-600">{s.provider ?? "All"}</td>
                                <td className="px-3 py-2 text-ink-600">{fmtBand(s.minAmount, s.maxAmount)}</td>
                                <td className="px-3 py-2 text-right text-ink-900">{fmtRate(s.chargeType, s.chargeValue)}</td>
                                <td className="px-3 py-2 text-right text-emerald-700">
                                  {fmtRate(s.commissionType, s.commissionValue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-100">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-400">
                    <tr>
                      <th className="px-3 py-2">Rail</th>
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2">Card / Brand</th>
                      <th className="px-3 py-2">Band</th>
                      <th className="px-3 py-2 text-right">Your MDR T+1</th>
                      <th className="px-3 py-2 text-right">Your MDR T+0</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mdrBase?.slabs ?? []).map((s) => (
                      <tr key={s.id} className="border-t border-ink-50">
                        <td className="px-3 py-2 font-medium text-ink-900">{s.serviceKind}</td>
                        <td className="px-3 py-2 text-ink-600">{s.company ?? "All"}</td>
                        <td className="px-3 py-2 text-ink-600">{s.paymentMode === "*" ? "Any" : s.paymentMode}</td>
                        <td className="px-3 py-2 text-xs text-ink-600">
                          {[s.cardType, s.brandType, s.classification].filter(Boolean).join(" / ") || "Any"}
                        </td>
                        <td className="px-3 py-2 text-ink-600">{fmtBand(s.minAmount, s.maxAmount)}</td>
                        <td className="px-3 py-2 text-right text-ink-900">{fmtRate(s.mdrType, s.mdrValue)}</td>
                        <td className="px-3 py-2 text-right text-ink-900">
                          {s.mdrValueT0 > 0 ? fmtRate(s.mdrType, s.mdrValueT0) : "= T+1"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Derived schemes — Same Day style expandable cards */}
          <section className="space-y-3">
            {(tab === "commission" ? schemes : mdrSchemes).map((s) =>
              tab === "commission" ? (
                <DerivedSchemeCard
                  key={s.id}
                  scheme={s as Scheme}
                  base={base}
                  onEdit={(scheme, focusFamily) => setEditor({ kind: "commission", scheme, focusFamily })}
                  onChanged={load}
                />
              ) : (
                <DerivedMdrCard
                  key={s.id}
                  scheme={s as MdrScheme}
                  onEdit={(scheme) => setEditor({ kind: "mdr", scheme })}
                  onChanged={load}
                />
              )
            )}
            {(tab === "commission" ? schemes : mdrSchemes).length === 0 && (
              <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 p-8 text-center text-sm text-ink-500">
                No schemes yet. Create one from your rate-card and assign it to your network from the
                Network page.
              </div>
            )}
          </section>
        </>
      )}

      {editor?.kind === "commission" && base && (
        <CommissionEditor
          base={base}
          scheme={editor.scheme}
          onClose={() => setEditor(null)}
          onDone={() => {
            setEditor(null);
            load();
          }}
        />
      )}
      {editor?.kind === "mdr" && mdrBase && (
        <MdrEditor
          base={mdrBase}
          scheme={editor.scheme}
          onClose={() => setEditor(null)}
          onDone={() => {
            setEditor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ── Derived service-scheme card (icon strip + expandable family sections) ──

function DerivedSchemeCard({
  scheme,
  base,
  onEdit,
  onChanged,
}: {
  scheme: Scheme;
  base: Scheme | null;
  onEdit: (scheme: Scheme, focusFamily?: string) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const grouped = useMemo(() => groupByFamily(scheme.slabs ?? []), [scheme.slabs]);
  const baseByParent = useMemo(() => {
    const map = new Map<string, Slab>();
    for (const bs of base?.slabs ?? []) map.set(bs.id, bs);
    return map;
  }, [base]);

  const familiesPresent = new Set(grouped.map(([f]) => f.key));

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-500 text-white">
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-display text-sm font-semibold text-ink-900">{scheme.name}</h4>
            <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "Active" : "Inactive"}</Badge>
            <Badge variant="brand">{scheme.slabs?.length ?? 0} slabs</Badge>
            <Badge variant="default">
              <Users className="h-3 w-3" /> {scheme.userCount} assigned
            </Badge>
          </div>
          {scheme.description && <p className="mt-0.5 truncate text-xs text-ink-500">{scheme.description}</p>}
        </div>

        <div className="flex items-center gap-0.5">
          {SERVICE_FAMILIES.filter((f) => familiesPresent.has(f.key)).map((f) => {
            const cfg = FAMILY_ICONS[f.key];
            const Icon = cfg.icon;
            return (
              <button
                key={f.key}
                onClick={() => onEdit(scheme, f.key)}
                className={`grid h-8 w-8 place-items-center rounded-lg ${cfg.className} hover:bg-ink-50`}
                title={`Edit ${f.label} slabs`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <button
            onClick={() => onEdit(scheme)}
            className="grid h-8 w-8 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
            title="Edit scheme"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {scheme.userCount === 0 && scheme.active && (
            <DeactivateIcon kind="commission" schemeId={scheme.id} onDone={onChanged} />
          )}
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
          {grouped.length === 0 ? (
            <p className="py-2 text-center text-sm text-ink-500">No slabs.</p>
          ) : (
            grouped.map(([family, list]) => {
              const cfg = FAMILY_ICONS[family.key];
              const Icon = cfg.icon;
              return (
                <div key={family.key}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${cfg.className}`} />
                    <h5 className={`text-sm font-semibold ${cfg.className}`}>
                      {family.label} ({list.length})
                    </h5>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
                    <table className="w-full min-w-max text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-400">
                        <tr>
                          <th className="px-3 py-2">Service</th>
                          <th className="px-3 py-2">Provider</th>
                          <th className="px-3 py-2">Band</th>
                          <th className="px-3 py-2 text-right">Child charge</th>
                          <th className="px-3 py-2 text-right">Child commission</th>
                          <th className="px-3 py-2 text-right">Your margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((s) => {
                          const parent = s.parentSlabId ? baseByParent.get(s.parentSlabId) : undefined;
                          return (
                            <tr key={s.id} className="border-t border-ink-50">
                              <td className="px-3 py-2 font-medium text-ink-900">{s.service.replace(/_/g, " ")}</td>
                              <td className="px-3 py-2 text-xs text-ink-600">{s.provider ?? "All"}</td>
                              <td className="px-3 py-2 text-ink-600">{fmtBand(s.minAmount, s.maxAmount)}</td>
                              <td className="px-3 py-2 text-right">{fmtRate(s.chargeType, s.chargeValue)}</td>
                              <td className="px-3 py-2 text-right">{fmtRate(s.commissionType, s.commissionValue)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                                {parent
                                  ? fmtRate(
                                      s.chargeType,
                                      Math.max(0, s.chargeValue - parent.chargeValue) +
                                        Math.max(0, parent.commissionValue - s.commissionValue)
                                    )
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Derived MDR scheme card ──

function DerivedMdrCard({
  scheme,
  onEdit,
  onChanged,
}: {
  scheme: MdrScheme;
  onEdit: (scheme: MdrScheme) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-display text-sm font-semibold text-ink-900">{scheme.name}</h4>
            <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "Active" : "Inactive"}</Badge>
            <Badge variant="brand">{scheme.slabs?.length ?? 0} rates</Badge>
            <Badge variant="default">
              <Users className="h-3 w-3" /> {scheme.userCount} assigned
            </Badge>
          </div>
          {scheme.description && <p className="mt-0.5 truncate text-xs text-ink-500">{scheme.description}</p>}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onEdit(scheme)}
            className="grid h-8 w-8 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
            title="Edit MDR scheme"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {scheme.userCount === 0 && scheme.active && (
            <DeactivateIcon kind="mdr" schemeId={scheme.id} onDone={onChanged} />
          )}
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
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-3 py-2">Rail</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Card / Brand</th>
                  <th className="px-3 py-2">Band</th>
                  <th className="px-3 py-2 text-right">Child MDR T+1</th>
                  <th className="px-3 py-2 text-right">Child MDR T+0</th>
                </tr>
              </thead>
              <tbody>
                {(scheme.slabs ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-ink-50">
                    <td className="px-3 py-2 font-medium text-ink-900">{s.serviceKind}</td>
                    <td className="px-3 py-2 text-ink-600">{s.company ?? "All"}</td>
                    <td className="px-3 py-2 text-ink-600">{s.paymentMode === "*" ? "Any" : s.paymentMode}</td>
                    <td className="px-3 py-2 text-xs text-ink-600">
                      {[s.cardType, s.brandType, s.classification].filter(Boolean).join(" / ") || "Any"}
                    </td>
                    <td className="px-3 py-2 text-ink-600">{fmtBand(s.minAmount, s.maxAmount)}</td>
                    <td className="px-3 py-2 text-right">{fmtRate(s.mdrType, s.mdrValue)}</td>
                    <td className="px-3 py-2 text-right">
                      {s.mdrValueT0 > 0 ? fmtRate(s.mdrType, s.mdrValueT0) : "= T+1"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DeactivateIcon({
  kind,
  schemeId,
  onDone,
}: {
  kind: "commission" | "mdr";
  schemeId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/network/${kind === "commission" ? "schemes" : "mdr-schemes"}/${schemeId}`, {
            method: "DELETE",
          });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
      className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
      title="Deactivate scheme"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

// ── Commission scheme editor (family-grouped, bands + dimensions locked) ──

function CommissionEditor({
  base,
  scheme,
  onClose,
  onDone,
}: {
  base: Scheme;
  scheme: Scheme | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const editing = !!scheme;
  const [name, setName] = useState(scheme?.name ?? "");
  const [description, setDescription] = useState(scheme?.description ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rows are keyed by BASE slab id. On create, values start at the base
  // (zero margin); on edit, values come from the derived slabs.
  const baseSlabs = useMemo(() => base.slabs ?? [], [base]);
  const groupedBase = useMemo(() => groupByFamily(baseSlabs), [baseSlabs]);
  const [values, setValues] = useState<Record<string, { charge: string; commission: string; derivedId?: string }>>(() => {
    const init: Record<string, { charge: string; commission: string; derivedId?: string }> = {};
    for (const bs of baseSlabs) {
      const derived = scheme?.slabs?.find((s) => s.parentSlabId === bs.id);
      init[bs.id] = {
        charge: String(derived?.chargeValue ?? bs.chargeValue),
        commission: String(derived?.commissionValue ?? bs.commissionValue),
        derivedId: derived?.id,
      };
    }
    return init;
  });

  const submit = async () => {
    setErr(null);
    if (name.trim().length < 3) {
      setErr("Name must be at least 3 characters");
      return;
    }
    setBusy(true);
    try {
      let res: Response;
      if (editing && scheme) {
        res = await fetch(`/api/network/schemes/${scheme.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            slabs: Object.values(values)
              .filter((v) => v.derivedId)
              .map((v) => ({ id: v.derivedId!, chargeValue: Number(v.charge), commissionValue: Number(v.commission) })),
          }),
        });
      } else {
        res = await fetch("/api/network/schemes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            overrides: baseSlabs.map((bs) => ({
              parentSlabId: bs.id,
              chargeValue: Number(values[bs.id]?.charge ?? bs.chargeValue),
              commissionValue: Number(values[bs.id]?.commission ?? bs.commissionValue),
            })),
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Validation failed — check your values");
        return;
      }
      onDone();
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditorShell
      title={editing ? `Edit ${scheme?.name}` : "New scheme for your network"}
      subtitle="Charge must be ≥ your rate; commission must be ≤ your rate. Bands and providers are locked to your rate-card. The differences are your margin."
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Scheme name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gold Retailer Plan"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes for yourself"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 max-h-[45vh] space-y-4 overflow-y-auto pr-1">
        {groupedBase.map(([family, list]) => {
          const cfg = FAMILY_ICONS[family.key];
          const Icon = cfg.icon;
          return (
            <div key={family.key}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${cfg.className}`} />
                <h5 className={`text-sm font-semibold ${cfg.className}`}>{family.label}</h5>
              </div>
              <div className="overflow-x-auto rounded-xl border border-ink-100">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                    <tr>
                      <th className="px-3 py-2">Service / band</th>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2 text-right">Your rate</th>
                      <th className="px-3 py-2 text-right">Child charge</th>
                      <th className="px-3 py-2 text-right">Child commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((bs) => {
                      const v = values[bs.id];
                      return (
                        <tr key={bs.id} className="border-t border-ink-50">
                          <td className="px-3 py-2">
                            <span className="font-medium text-ink-900">{bs.service.replace(/_/g, " ")}</span>
                            <span className="ml-1 text-xs text-ink-500">
                              ₹{bs.minAmount}–₹{bs.maxAmount}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-ink-500">{bs.provider ?? "All"}</td>
                          <td className="px-3 py-2 text-right text-xs text-ink-500">
                            {fmtRate(bs.chargeType, bs.chargeValue)} / {fmtRate(bs.commissionType, bs.commissionValue)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="any"
                              min={bs.chargeValue}
                              value={v?.charge ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], charge: e.target.value } }))
                              }
                              className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                              title={`Minimum ${bs.chargeValue} (${bs.chargeType})`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              max={bs.commissionValue}
                              value={v?.commission ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [bs.id]: { ...prev[bs.id], commission: e.target.value },
                                }))
                              }
                              className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                              title={`Maximum ${bs.commissionValue} (${bs.commissionType})`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {err && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {err}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {editing ? "Save changes" : "Create scheme"}
        </Button>
      </div>
    </EditorShell>
  );
}

// ── MDR scheme editor (dimensions locked, T+1 and T+0 editable) ──

function MdrEditor({
  base,
  scheme,
  onClose,
  onDone,
}: {
  base: MdrScheme;
  scheme: MdrScheme | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const editing = !!scheme;
  const [name, setName] = useState(scheme?.name ?? "");
  const [description, setDescription] = useState(scheme?.description ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseSlabs = useMemo(() => base.slabs ?? [], [base]);
  const [values, setValues] = useState<Record<string, { mdr: string; mdrT0: string; derivedId?: string }>>(() => {
    const init: Record<string, { mdr: string; mdrT0: string; derivedId?: string }> = {};
    for (const bs of baseSlabs) {
      const derived = scheme?.slabs?.find((s) => s.parentSlabId === bs.id);
      init[bs.id] = {
        mdr: String(derived?.mdrValue ?? bs.mdrValue),
        mdrT0: String(derived?.mdrValueT0 ?? bs.mdrValueT0),
        derivedId: derived?.id,
      };
    }
    return init;
  });

  const submit = async () => {
    setErr(null);
    if (name.trim().length < 3) {
      setErr("Name must be at least 3 characters");
      return;
    }
    setBusy(true);
    try {
      let res: Response;
      if (editing && scheme) {
        res = await fetch(`/api/network/mdr-schemes/${scheme.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            slabs: Object.values(values)
              .filter((v) => v.derivedId)
              .map((v) => ({ id: v.derivedId!, mdrValue: Number(v.mdr), mdrValueT0: Number(v.mdrT0) })),
          }),
        });
      } else {
        res = await fetch("/api/network/mdr-schemes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            overrides: baseSlabs.map((bs) => ({
              parentSlabId: bs.id,
              mdrValue: Number(values[bs.id]?.mdr ?? bs.mdrValue),
              mdrValueT0: Number(values[bs.id]?.mdrT0 ?? bs.mdrValueT0),
            })),
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Validation failed — check your values");
        return;
      }
      onDone();
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditorShell
      title={editing ? `Edit ${scheme?.name}` : "New MDR scheme for your network"}
      subtitle="MDR must be ≥ your rate (both T+1 and T+0). Company/card dimensions are locked to your rate-card. The difference on every capture is your margin."
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Scheme name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Retail POS 1.2%"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes for yourself"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-ink-100">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="sticky top-0 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-3 py-2">Rail / dimensions / band</th>
              <th className="px-3 py-2 text-right">Your MDR (T+1 / T+0)</th>
              <th className="px-3 py-2 text-right">Child T+1</th>
              <th className="px-3 py-2 text-right">Child T+0</th>
            </tr>
          </thead>
          <tbody>
            {baseSlabs.map((bs) => {
              const v = values[bs.id];
              const dims = [
                bs.company ?? "All companies",
                bs.paymentMode === "*" ? "Any mode" : bs.paymentMode,
                [bs.cardType, bs.brandType, bs.classification].filter(Boolean).join("/"),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={bs.id} className="border-t border-ink-50">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink-900">{bs.serviceKind}</span>
                    <span className="ml-1 text-xs text-ink-500">{dims}</span>
                    <span className="ml-1 text-xs text-ink-500">
                      ₹{bs.minAmount}–₹{bs.maxAmount}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-ink-500">
                    {fmtRate(bs.mdrType, bs.mdrValue)} / {bs.mdrValueT0 > 0 ? fmtRate(bs.mdrType, bs.mdrValueT0) : "= T+1"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min={bs.mdrValue}
                      value={v?.mdr ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], mdr: e.target.value } }))}
                      className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                      title={`Minimum ${bs.mdrValue} (${bs.mdrType})`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min={bs.mdrValueT0}
                      value={v?.mdrT0 ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], mdrT0: e.target.value } }))}
                      className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                      title={`Minimum ${bs.mdrValueT0} (${bs.mdrType})`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {err && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {err}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {editing ? "Save changes" : "Create MDR scheme"}
        </Button>
      </div>
    </EditorShell>
  );
}

// ── Shared modal shell ──

function EditorShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">{title}</h3>
            <p className="text-xs text-ink-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
