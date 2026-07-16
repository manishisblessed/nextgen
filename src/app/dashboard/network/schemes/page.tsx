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
  Send,
  Store,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SERVICE_FAMILIES, familyOf, isChargeDrivenService, schemeAssignerLabel, type ServiceFamily } from "@/lib/scheme/constants";

/**
 * My Schemes — SD/MD/DT scheme workspace (cascade model, unified scheme).
 *
 * Your parent (or admin) assigned you ONE base scheme carrying BBPS + Payout
 * charges/commission AND POS MDR. Here you derive schemes for your children by
 * adding margin per slab:
 *   child charge >= your charge, child commission <= your commission,
 *   child MDR >= your MDR. The difference on every transaction is YOUR margin
 *   (2% TDS applies). Bands and dimensions are locked to the parent scheme —
 *   only values change.
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

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  userCount: number;
  slabs?: Slab[];
  mdrSlabs?: MdrSlab[];
};

const FAMILY_ICONS: Record<string, { icon: typeof CreditCard; className: string }> = {
  BBPS: { icon: CreditCard, className: "text-blue-600" },
  PAYOUT: { icon: Send, className: "text-cyan-600" },
};

const fmtRate = (type: RateType, value: number) =>
  type === "PERCENT" ? `${(value * 100).toFixed(2)}%` : `₹${value}`;

/** Service slabs (BBPS/Payout) are always flat ₹ — guard against stale PERCENT types in DB. */
const fmtServiceRate = (_type: RateType, value: number) => `₹${value}`;

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
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState<Scheme | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ scheme: Scheme | null; focusFamily?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await fetch("/api/network/schemes").then((r) => r.json());
      setBase(a.baseScheme ?? null);
      setSchemes(a.schemes ?? []);
      setRole(a.role ?? null);
    } catch {
      // network hiccup — keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network pricing"
        title="My Schemes"
        description="Derive schemes from your own rate-card and assign them to your network. One scheme covers BBPS + Payout charges and POS MDR; your margin on every slab becomes your commission (2% TDS applies)."
        actions={
          <>
            <Button
              onClick={() => setEditor({ scheme: null })}
              disabled={!base}
              title={!base ? "You need a scheme assigned by your parent first" : undefined}
            >
              <Plus className="h-4 w-4" />
              New scheme
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-ink-100 bg-white py-16 text-ink-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading schemes…
        </div>
      ) : !base ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">No scheme assigned to you yet</p>
            <p className="mt-1">
              Ask your {schemeAssignerLabel(role)} to assign one. Until then you cannot transact or
              create schemes for your network.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Base scheme (your rates) */}
          <section className="rounded-2xl border border-ink-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-ink-400" />
              <h3 className="font-display text-sm font-semibold text-ink-900">Your rate-card: {base.name}</h3>
              <Badge variant="brand">assigned to you</Badge>
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-500">
              <Info className="h-3.5 w-3.5" />
              This is the rate-card assigned to you. Schemes you create for your network must charge at
              least this — the difference on every transaction is your margin.
            </p>
            <div className="space-y-4">
              {groupByFamily(base.slabs ?? []).map(([family, list]) => {
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
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((s) => (
                            <tr key={s.id} className="border-t border-ink-50">
                              <td className="px-3 py-2 font-medium text-ink-900">{s.service.replace(/_/g, " ")}</td>
                              <td className="px-3 py-2 text-xs text-ink-600">{s.provider ?? "All"}</td>
                              <td className="px-3 py-2 text-ink-600">{fmtBand(s.minAmount, s.maxAmount)}</td>
                              <td className="px-3 py-2 text-right text-ink-900">{fmtRate(s.chargeType, s.chargeValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {(base.mdrSlabs ?? []).length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Store className="h-4 w-4 text-orange-600" />
                    <h4 className="text-sm font-semibold text-orange-600">POS MDR ({base.mdrSlabs!.length})</h4>
                  </div>
                  <MdrTable slabs={base.mdrSlabs ?? []} valueLabel="Your MDR" />
                </div>
              )}
            </div>
          </section>

          {/* Derived schemes */}
          <section className="space-y-3">
            {schemes.map((s) => (
              <DerivedSchemeCard
                key={s.id}
                scheme={s}
                base={base}
                onEdit={(scheme, focusFamily) => setEditor({ scheme, focusFamily })}
                onChanged={load}
              />
            ))}
            {schemes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 p-8 text-center text-sm text-ink-500">
                No schemes yet. Create one from your rate-card and assign it to your network from the
                Network page.
              </div>
            )}
          </section>
        </>
      )}

      {editor && base && (
        <SchemeEditor
          base={base}
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

// ── Reusable MDR table (read-only) ──

function MdrTable({ slabs, valueLabel }: { slabs: MdrSlab[]; valueLabel: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-400">
          <tr>
            <th className="px-3 py-2">Rail</th>
            <th className="px-3 py-2">Company</th>
            <th className="px-3 py-2">Mode</th>
            <th className="px-3 py-2">Card / Brand</th>
            <th className="px-3 py-2 text-right">{valueLabel} T+1</th>
            <th className="px-3 py-2 text-right">{valueLabel} T+0</th>
          </tr>
        </thead>
        <tbody>
          {slabs.map((s) => (
            <tr key={s.id} className="border-t border-ink-50">
              <td className="px-3 py-2 font-medium text-ink-900">{s.serviceKind}</td>
              <td className="px-3 py-2 text-ink-600">{s.company ?? "All"}</td>
              <td className="px-3 py-2 text-ink-600">{s.paymentMode === "*" ? "Any" : s.paymentMode}</td>
              <td className="px-3 py-2 text-xs text-ink-600">
                {[s.cardType, s.brandType, s.classification].filter(Boolean).join(" / ") || "Any"}
              </td>
              <td className="px-3 py-2 text-right text-ink-900">{fmtRate(s.mdrType, s.mdrValue)}</td>
              <td className="px-3 py-2 text-right text-ink-900">
                {s.mdrValueT0 > 0 ? fmtRate(s.mdrType, s.mdrValueT0) : "= T+1"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Derived scheme card (icon strip + expandable family + POS MDR sections) ──

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
  const mdrSlabs = scheme.mdrSlabs ?? [];

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
            {mdrSlabs.length > 0 && <Badge variant="warning">{mdrSlabs.length} MDR</Badge>}
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
            <DeactivateIcon schemeId={scheme.id} onDone={onChanged} />
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
          {grouped.length === 0 && mdrSlabs.length === 0 ? (
            <p className="py-2 text-center text-sm text-ink-500">No slabs.</p>
          ) : (
            <>
              {grouped.map(([family, list]) => {
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
                                <td className="px-3 py-2 text-right">{fmtServiceRate(s.chargeType, s.chargeValue)}</td>
                                <td className="px-3 py-2 text-right">{fmtServiceRate(s.commissionType, s.commissionValue)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                                  {!parent ? (
                                    "—"
                                  ) : isChargeDrivenService(s.service) ? (
                                    (() => {
                                      // BBPS/Payout: margin = charge markup − child commission.
                                      const m = Math.max(0, s.chargeValue - parent.chargeValue - s.commissionValue);
                                      return m > 0 ? fmtServiceRate("FLAT", m) : "—";
                                    })()
                                  ) : (
                                    <div className="space-y-0.5">
                                      {s.chargeValue > parent.chargeValue && (
                                        <div>{fmtServiceRate(s.chargeType, Math.max(0, s.chargeValue - parent.chargeValue))}</div>
                                      )}
                                      {parent.commissionValue > s.commissionValue && (
                                        <div>{fmtServiceRate(s.commissionType, Math.max(0, parent.commissionValue - s.commissionValue))}</div>
                                      )}
                                      {s.chargeValue <= parent.chargeValue && parent.commissionValue <= s.commissionValue && "—"}
                                    </div>
                                  )}
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

              {mdrSlabs.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Store className="h-4 w-4 text-orange-600" />
                    <h5 className="text-sm font-semibold text-orange-600">POS MDR ({mdrSlabs.length})</h5>
                  </div>
                  <MdrTable slabs={mdrSlabs} valueLabel="Child MDR" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DeactivateIcon({ schemeId, onDone }: { schemeId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/network/schemes/${schemeId}`, { method: "DELETE" });
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

// ── Unified scheme editor (service slabs + POS MDR, bands/dimensions locked) ──

function SchemeEditor({
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

  const baseSlabs = useMemo(() => base.slabs ?? [], [base]);
  const baseMdr = useMemo(() => base.mdrSlabs ?? [], [base]);
  const groupedBase = useMemo(() => groupByFamily(baseSlabs), [baseSlabs]);

  // Service slab values keyed by BASE slab id.
  const [values, setValues] = useState<Record<string, { charge: string; commission: string; derivedId?: string }>>(() => {
    const init: Record<string, { charge: string; commission: string; derivedId?: string }> = {};
    for (const bs of baseSlabs) {
      const derived = scheme?.slabs?.find((s) => s.parentSlabId === bs.id);
      init[bs.id] = {
        charge: derived ? String(derived.chargeValue) : "",
        commission: derived ? String(derived.commissionValue) : "",
        derivedId: derived?.id,
      };
    }
    return init;
  });

  // POS MDR values keyed by BASE mdr slab id.
  const [mdrValues, setMdrValues] = useState<Record<string, { mdr: string; mdrT0: string; derivedId?: string }>>(() => {
    const init: Record<string, { mdr: string; mdrT0: string; derivedId?: string }> = {};
    for (const bs of baseMdr) {
      const derived = scheme?.mdrSlabs?.find((s) => s.parentSlabId === bs.id);
      init[bs.id] = {
        mdr: derived ? String(derived.mdrValue) : "",
        mdrT0: derived ? String(derived.mdrValueT0) : "",
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
            mdrSlabs: Object.values(mdrValues)
              .filter((v) => v.derivedId)
              .map((v) => ({ id: v.derivedId!, mdrValue: Number(v.mdr), mdrValueT0: Number(v.mdrT0) })),
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
              chargeValue: values[bs.id]?.charge !== "" ? Number(values[bs.id].charge) : Number(bs.chargeValue),
              commissionValue: values[bs.id]?.commission !== "" ? Number(values[bs.id].commission) : 0,
            })),
            mdrOverrides: baseMdr.map((bs) => ({
              parentSlabId: bs.id,
              mdrValue: mdrValues[bs.id]?.mdr !== "" ? Number(mdrValues[bs.id].mdr) : Number(bs.mdrValue),
              mdrValueT0: mdrValues[bs.id]?.mdrT0 !== "" ? Number(mdrValues[bs.id].mdrT0) : Number(bs.mdrValueT0),
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
      subtitle="Charge/MDR must be ≥ your rate; commission must be ≤ your rate. Bands, providers and dimensions are locked to your rate-card. The differences are your margin."
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
                      <th className="px-3 py-2 text-right">Your commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((bs) => {
                      const v = values[bs.id];
                      // Service slabs are always flat ₹ — ignore stale PERCENT types in DB
                      const chgPct = false;
                      const comPct = false;
                      const toChgDisplay = (raw: number) => raw;
                      const toChgRaw = (display: number) => display;
                      const toComDisplay = (raw: number) => raw;
                      const toComRaw = (display: number) => display;

                      const childCharge = v?.charge !== "" ? Number(v?.charge) : Number(bs.chargeValue);
                      const childCommission = v?.commission !== "" ? Number(v?.commission) : 0;
                      const chargeDriven = isChargeDrivenService(bs.service);
                      const chargeMargin = Math.max(0, childCharge - Number(bs.chargeValue));
                      const commissionMargin = Math.max(0, Number(bs.commissionValue) - childCommission);
                      // BBPS/Payout: your margin = charge markup − commission you give the child.
                      const netMargin = Math.max(0, chargeMargin - childCommission);
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
                            {fmtServiceRate(bs.chargeType, bs.chargeValue)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                min={toChgDisplay(Number(bs.chargeValue))}
                                value={v?.charge !== "" ? toChgDisplay(childCharge) : ""}
                                onChange={(e) => {
                                  const raw = e.target.value === "" ? "" : String(toChgRaw(Number(e.target.value)));
                                  setValues((prev) => ({
                                    ...prev,
                                    [bs.id]: { ...prev[bs.id], charge: raw },
                                  }));
                                }}
                                className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                                title={`Minimum ${toChgDisplay(Number(bs.chargeValue))}`}
                              />
                              {chgPct && <span className="text-xs text-ink-400">%</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                min={0}
                                value={v?.commission !== "" ? toComDisplay(childCommission) : ""}
                                onChange={(e) => {
                                  const raw = e.target.value === "" ? "" : String(toComRaw(Number(e.target.value)));
                                  setValues((prev) => ({
                                    ...prev,
                                    [bs.id]: { ...prev[bs.id], commission: raw },
                                  }));
                                }}
                                className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                              />
                              {comPct && <span className="text-xs text-ink-400">%</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {(() => {
                              // BBPS/Payout (charge-driven): margin = charge markup − child commission.
                              // Pool services keep markup + retained commission.
                              const net = chargeDriven
                                ? netMargin
                                : Math.max(0, chargeMargin + (Number(bs.commissionValue) - childCommission));
                              return (
                                <span className={`font-semibold ${net > 0 ? "text-emerald-700" : "text-ink-400"}`}>
                                  {net > 0 ? fmtServiceRate("FLAT", net) : "—"}
                                </span>
                              );
                            })()}
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

        {baseMdr.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Store className="h-4 w-4 text-orange-600" />
              <h5 className="text-sm font-semibold text-orange-600">POS MDR</h5>
            </div>
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full min-w-max text-left text-sm">
                <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-3 py-2">Rail / dimensions</th>
                    <th className="px-3 py-2 text-right">Your MDR (T+1 / T+0)</th>
                    <th className="px-3 py-2 text-right">Child T+1</th>
                    <th className="px-3 py-2 text-right">Child T+0</th>
                    <th className="px-3 py-2 text-right">Your commission T+1</th>
                    <th className="px-3 py-2 text-right">Your commission T+0</th>
                  </tr>
                </thead>
                <tbody>
                  {baseMdr.map((bs) => {
                    const v = mdrValues[bs.id];
                    const isPct = bs.mdrType === "PERCENT";
                    const toDisplay = (raw: number) => isPct ? parseFloat((raw * 100).toFixed(6)) : raw;
                    const toRaw = (display: number) => isPct ? display / 100 : display;
                    const childMdr = v?.mdr !== "" ? Number(v?.mdr) : Number(bs.mdrValue);
                    const childMdrT0 = v?.mdrT0 !== "" ? Number(v?.mdrT0) : Number(bs.mdrValueT0);
                    const marginT1 = Math.max(0, childMdr - bs.mdrValue);
                    const marginT0 = Math.max(0, childMdrT0 - (bs.mdrValueT0 > 0 ? bs.mdrValueT0 : bs.mdrValue));
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
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-ink-500">
                          {fmtRate(bs.mdrType, bs.mdrValue)} /{" "}
                          {bs.mdrValueT0 > 0 ? fmtRate(bs.mdrType, bs.mdrValueT0) : "= T+1"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              min={toDisplay(Number(bs.mdrValue))}
                              value={v?.mdr !== "" ? toDisplay(childMdr) : ""}
                              placeholder={String(toDisplay(Number(bs.mdrValue)))}
                              onChange={(e) => {
                                const raw = e.target.value === "" ? "" : String(toRaw(Number(e.target.value)));
                                setMdrValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], mdr: raw } }));
                              }}
                              className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                              title={`Minimum ${toDisplay(Number(bs.mdrValue))}${isPct ? "%" : ""}`}
                            />
                            {isPct && <span className="text-xs text-ink-400">%</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              min={toDisplay(Number(bs.mdrValueT0 > 0 ? bs.mdrValueT0 : bs.mdrValue))}
                              value={v?.mdrT0 !== "" ? toDisplay(childMdrT0) : ""}
                              placeholder={String(toDisplay(Number(bs.mdrValueT0 > 0 ? bs.mdrValueT0 : bs.mdrValue)))}
                              onChange={(e) => {
                                const raw = e.target.value === "" ? "" : String(toRaw(Number(e.target.value)));
                                setMdrValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], mdrT0: raw } }));
                              }}
                              className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                              title={`Minimum ${toDisplay(Number(bs.mdrValueT0 > 0 ? bs.mdrValueT0 : bs.mdrValue))}${isPct ? "%" : ""}`}
                            />
                            {isPct && <span className="text-xs text-ink-400">%</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-semibold ${marginT1 > 0 ? "text-emerald-700" : "text-ink-400"}`}>
                            {fmtRate(bs.mdrType, marginT1)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-semibold ${marginT0 > 0 ? "text-emerald-700" : "text-ink-400"}`}>
                            {fmtRate(bs.mdrType, marginT0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
