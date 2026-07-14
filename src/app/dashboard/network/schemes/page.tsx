"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers, Plus, RefreshCw, X, Loader2, AlertCircle, Check, Pencil, Trash2, Info,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/**
 * My Schemes — SD/MD/DT scheme workspace (cascade model).
 *
 * Your parent (or admin) assigned you a base scheme: those are YOUR rates.
 * Here you derive schemes for your children by adding margin per slab:
 *   child charge >= your charge, child commission <= your commission.
 * The difference on every transaction is YOUR commission (2% TDS applies).
 */

type Slab = {
  id: string;
  service: string;
  minAmount: number;
  maxAmount: number;
  chargeType: "FLAT" | "PERCENT";
  chargeValue: number;
  commissionType: "FLAT" | "PERCENT";
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
  minAmount: number;
  maxAmount: number;
  mdrType: "FLAT" | "PERCENT";
  mdrValue: number;
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

const fmtRate = (type: "FLAT" | "PERCENT", value: number) =>
  type === "PERCENT" ? `${(value * 100).toFixed(2)}%` : `₹${value}`;

export default function MySchemesPage() {
  const [tab, setTab] = useState<"commission" | "mdr">("commission");
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState<Scheme | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [mdrBase, setMdrBase] = useState<MdrScheme | null>(null);
  const [mdrSchemes, setMdrSchemes] = useState<MdrScheme[]>([]);
  const [editor, setEditor] = useState<
    | { kind: "commission"; scheme: Scheme | null }
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

  useEffect(() => { load(); }, [load]);

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
              onClick={() => setEditor(tab === "commission" ? { kind: "commission", scheme: null } : { kind: "mdr", scheme: null })}
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
            <p className="font-semibold">
              No {tab === "commission" ? "scheme" : "MDR scheme"} assigned to you yet
            </p>
            <p className="mt-1">
              Ask your {tab === "commission" ? "parent (or admin)" : "parent (or admin)"} to assign
              one. Until then you cannot transact or create schemes for your network.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Base scheme (your rates) */}
          <section className="rounded-2xl border border-ink-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-ink-400" />
              <h3 className="font-display text-sm font-semibold text-ink-900">
                Your rate-card: {activeBase.name}
              </h3>
              <Badge variant="brand">assigned to you</Badge>
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-500">
              <Info className="h-3.5 w-3.5" />
              These are the rates YOU pay/earn. Schemes you create must charge at least this and
              give commission at most this — the difference is your margin.
            </p>
            <div className="overflow-x-auto">
              {tab === "commission" ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                      <th className="py-2 pr-4">Service</th>
                      <th className="py-2 pr-4">Band</th>
                      <th className="py-2 pr-4 text-right">Your charge</th>
                      <th className="py-2 text-right">Your commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(base?.slabs ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-ink-50">
                        <td className="py-2 pr-4 font-medium text-ink-900">{s.service.replace(/_/g, " ")}</td>
                        <td className="py-2 pr-4 text-ink-600">₹{s.minAmount} – ₹{s.maxAmount}</td>
                        <td className="py-2 pr-4 text-right text-ink-900">{fmtRate(s.chargeType, s.chargeValue)}</td>
                        <td className="py-2 text-right text-emerald-700">{fmtRate(s.commissionType, s.commissionValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                      <th className="py-2 pr-4">Rail</th>
                      <th className="py-2 pr-4">Mode</th>
                      <th className="py-2 pr-4">Band</th>
                      <th className="py-2 text-right">Your MDR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mdrBase?.slabs ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-ink-50">
                        <td className="py-2 pr-4 font-medium text-ink-900">{s.serviceKind}</td>
                        <td className="py-2 pr-4 text-ink-600">{s.paymentMode}</td>
                        <td className="py-2 pr-4 text-ink-600">₹{s.minAmount} – ₹{s.maxAmount}</td>
                        <td className="py-2 text-right text-ink-900">{fmtRate(s.mdrType, s.mdrValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Derived schemes */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(tab === "commission" ? schemes : mdrSchemes).map((s) => (
              <div key={s.id} className="rounded-2xl border border-ink-100 bg-white p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-ink-900">{s.name}</h4>
                    {s.description && <p className="mt-0.5 text-xs text-ink-500">{s.description}</p>}
                  </div>
                  <Badge variant={s.active ? "success" : "danger"}>{s.active ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="text-xs text-ink-500">
                  {s.slabs?.length ?? 0} slab(s) · assigned to {s.userCount} user(s)
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditor(
                        tab === "commission"
                          ? { kind: "commission", scheme: s as Scheme }
                          : { kind: "mdr", scheme: s as MdrScheme }
                      )
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {s.userCount === 0 && s.active && (
                    <DeactivateButton kind={tab} schemeId={s.id} onDone={load} />
                  )}
                </div>
              </div>
            ))}
            {(tab === "commission" ? schemes : mdrSchemes).length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 p-8 text-center text-sm text-ink-500">
                No schemes yet. Create one from your rate-card and assign it to your network from
                the Network page.
              </div>
            )}
          </section>
        </>
      )}

      {editor?.kind === "commission" && base && (
        <CommissionEditor base={base} scheme={editor.scheme} onClose={() => setEditor(null)} onDone={() => { setEditor(null); load(); }} />
      )}
      {editor?.kind === "mdr" && mdrBase && (
        <MdrEditor base={mdrBase} scheme={editor.scheme} onClose={() => setEditor(null)} onDone={() => { setEditor(null); load(); }} />
      )}
    </div>
  );
}

function DeactivateButton({ kind, schemeId, onDone }: { kind: "commission" | "mdr"; schemeId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/network/${kind === "commission" ? "schemes" : "mdr-schemes"}/${schemeId}`, { method: "DELETE" });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Deactivate
    </Button>
  );
}

// ── Commission scheme editor ──

function CommissionEditor({
  base, scheme, onClose, onDone,
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
    if (name.trim().length < 3) { setErr("Name must be at least 3 characters"); return; }
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
      if (!res.ok) { setErr(typeof data.error === "string" ? data.error : "Validation failed — check your values"); return; }
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
      subtitle="Charge must be ≥ your rate; commission must be ≤ your rate. The differences are your margin."
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Scheme name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold Retailer Plan"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes for yourself"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-ink-100">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-3 py-2">Service / band</th>
              <th className="px-3 py-2 text-right">Your rate</th>
              <th className="px-3 py-2 text-right">Child charge</th>
              <th className="px-3 py-2 text-right">Child commission</th>
            </tr>
          </thead>
          <tbody>
            {baseSlabs.map((bs) => {
              const v = values[bs.id];
              return (
                <tr key={bs.id} className="border-t border-ink-50">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink-900">{bs.service.replace(/_/g, " ")}</span>
                    <span className="ml-1 text-xs text-ink-500">₹{bs.minAmount}–₹{bs.maxAmount}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-ink-500">
                    {fmtRate(bs.chargeType, bs.chargeValue)} / {fmtRate(bs.commissionType, bs.commissionValue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" step="any" min={bs.chargeValue}
                      value={v?.charge ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], charge: e.target.value } }))}
                      className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                      title={`Minimum ${bs.chargeValue} (${bs.chargeType})`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" step="any" min={0} max={bs.commissionValue}
                      value={v?.commission ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], commission: e.target.value } }))}
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

      {err && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {err}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {editing ? "Save changes" : "Create scheme"}
        </Button>
      </div>
    </EditorShell>
  );
}

// ── MDR scheme editor ──

function MdrEditor({
  base, scheme, onClose, onDone,
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
  const [values, setValues] = useState<Record<string, { mdr: string; derivedId?: string }>>(() => {
    const init: Record<string, { mdr: string; derivedId?: string }> = {};
    for (const bs of baseSlabs) {
      const derived = scheme?.slabs?.find((s) => s.parentSlabId === bs.id);
      init[bs.id] = { mdr: String(derived?.mdrValue ?? bs.mdrValue), derivedId: derived?.id };
    }
    return init;
  });

  const submit = async () => {
    setErr(null);
    if (name.trim().length < 3) { setErr("Name must be at least 3 characters"); return; }
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
              .map((v) => ({ id: v.derivedId!, mdrValue: Number(v.mdr) })),
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
            })),
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setErr(typeof data.error === "string" ? data.error : "Validation failed — check your values"); return; }
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
      subtitle="MDR must be ≥ your rate. The difference on every capture is your margin."
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Scheme name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retail POS 1.2%"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-500">Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes for yourself"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-ink-100">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-3 py-2">Rail / band</th>
              <th className="px-3 py-2 text-right">Your MDR</th>
              <th className="px-3 py-2 text-right">Child MDR</th>
            </tr>
          </thead>
          <tbody>
            {baseSlabs.map((bs) => {
              const v = values[bs.id];
              return (
                <tr key={bs.id} className="border-t border-ink-50">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink-900">{bs.serviceKind} · {bs.paymentMode}</span>
                    <span className="ml-1 text-xs text-ink-500">₹{bs.minAmount}–₹{bs.maxAmount}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-ink-500">{fmtRate(bs.mdrType, bs.mdrValue)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" step="any" min={bs.mdrValue}
                      value={v?.mdr ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [bs.id]: { ...prev[bs.id], mdr: e.target.value } }))}
                      className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm"
                      title={`Minimum ${bs.mdrValue} (${bs.mdrType})`}
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
        <Button variant="outline" onClick={onClose}>Cancel</Button>
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
  title, subtitle, onClose, children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
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
