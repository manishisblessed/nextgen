"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatINR } from "@/lib/utils";
import { Percent, Plus, RefreshCw, Trash2, FlaskConical, X } from "lucide-react";

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  slabs: number;
  users: number;
  createdAt: string;
};

type Slab = {
  id: string;
  serviceKind: string;
  paymentMode: string;
  minAmount: number;
  maxAmount: number;
  mdrType: string;
  mdrValue: number;
  commissionType: string;
  commissionRetailer: number;
  commissionDistributor: number;
  commissionMaster: number;
  commissionSuperDistributor: number;
  active: boolean;
};

type SchemeDetail = Scheme & { slabs2?: never };

const SERVICE_KINDS = ["POS", "PG", "QR", "UPI"] as const;

const inputCls =
  "rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function fmtRate(type: string, value: number) {
  return type === "PERCENT" ? `${(value * 100).toFixed(2)}%` : formatINR(value);
}

export default function MdrEnginePage() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ scheme: SchemeDetail; slabs: Slab[] } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showDiagnose, setShowDiagnose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mdr-schemes");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load MDR schemes");
      setSchemes(data.schemes);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadDetail = useCallback(async (id: string) => {
    setSelected(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/mdr-schemes/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load scheme");
      setDetail({ scheme: data.scheme, slabs: data.scheme.slabs });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Load failed", false);
      setSelected(null);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const patchScheme = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/mdr-schemes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(typeof data?.error === "string" ? data.error : "Update failed", false);
      return;
    }
    notify("Scheme updated.", true);
    load();
    if (selected === id) loadDetail(id);
  };

  const columns: Column<Scheme>[] = [
    {
      key: "name",
      header: "Scheme",
      render: (s) => (
        <button className="text-left" onClick={() => loadDetail(s.id)}>
          <span className="font-semibold text-brand-700 hover:underline">{s.name}</span>
          {s.description && <p className="text-xs text-ink-400">{s.description}</p>}
        </button>
      ),
    },
    {
      key: "flags",
      header: "Status",
      render: (s) => (
        <div className="flex gap-1.5">
          <Badge variant={s.active ? "success" : "danger"}>{s.active ? "active" : "inactive"}</Badge>
          {s.isDefault && <Badge variant="brand">default</Badge>}
        </div>
      ),
    },
    { key: "slabs", header: "Slabs", render: (s) => <span>{s.slabs}</span> },
    { key: "users", header: "Assigned users", render: (s) => <span>{s.users}</span> },
    {
      key: "actions",
      header: "",
      render: (s) => (
        <div className="flex justify-end gap-2">
          {!s.isDefault && (
            <Button size="sm" variant="outline" onClick={() => patchScheme(s.id, { isDefault: true })}>
              Make default
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => patchScheme(s.id, { active: !s.active })}
          >
            {s.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="MDR Engine"
        description="Merchant discount rate schemes for POS / PG / QR / UPI acquiring — slab-wise rates and network commission splits."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDiagnose(true)}>
              <FlaskConical className="mr-2 h-4 w-4" /> Diagnose
            </Button>
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> New scheme
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={schemes}
        loading={loading}
      />

      {selected && (
        <SlabEditor
          schemeId={selected}
          detail={detail}
          onClose={() => {
            setSelected(null);
            setDetail(null);
          }}
          onChanged={() => {
            loadDetail(selected);
            load();
          }}
          onNotice={notify}
        />
      )}

      {showCreate && (
        <CreateSchemeModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            notify("MDR scheme created.", true);
            load();
          }}
          onError={(text) => notify(text, false)}
        />
      )}

      {showDiagnose && <DiagnoseModal onClose={() => setShowDiagnose(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------ slab editor */

function SlabEditor({
  schemeId,
  detail,
  onClose,
  onChanged,
  onNotice,
}: {
  schemeId: string;
  detail: { scheme: Scheme; slabs: Slab[] } | null;
  onClose: () => void;
  onChanged: () => void;
  onNotice: (text: string, ok: boolean) => void;
}) {
  const [form, setForm] = useState({
    serviceKind: "POS",
    paymentMode: "*",
    minAmount: "1",
    maxAmount: "100000",
    mdrType: "PERCENT",
    mdrValue: "0.5",
    commissionType: "PERCENT",
    commissionRetailer: "0",
    commissionDistributor: "0",
    commissionMaster: "0",
    commissionSuperDistributor: "0",
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Slab | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Percent fields are entered as human percentages (0.5 = 0.5%) and stored
  // as fractions (0.005).
  const toFraction = (v: string, type: string) =>
    type === "PERCENT" ? Number(v) / 100 : Number(v);

  const addSlab = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/mdr-schemes/${schemeId}/slabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceKind: form.serviceKind,
          paymentMode: form.paymentMode.trim() || "*",
          minAmount: Number(form.minAmount),
          maxAmount: Number(form.maxAmount),
          mdrType: form.mdrType,
          mdrValue: toFraction(form.mdrValue, form.mdrType),
          commissionType: form.commissionType,
          commissionRetailer: toFraction(form.commissionRetailer, form.commissionType),
          commissionDistributor: toFraction(form.commissionDistributor, form.commissionType),
          commissionMaster: toFraction(form.commissionMaster, form.commissionType),
          commissionSuperDistributor: toFraction(form.commissionSuperDistributor, form.commissionType),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to add slab");
      onNotice("Slab added.", true);
      onChanged();
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Failed to add slab", false);
    } finally {
      setBusy(false);
    }
  };

  const removeSlab = async (slabId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/mdr-schemes/${schemeId}/slabs`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slabId }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotice(typeof data?.error === "string" ? data.error : "Delete failed", false);
        return;
      }
      onNotice("Slab deleted.", true);
      onChanged();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <Percent className="h-4 w-4 text-brand-600" />
          {detail ? `Slabs — ${detail.scheme.name}` : "Loading scheme…"}
        </h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {detail && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wider text-ink-400">
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Band</th>
                  <th className="py-2 pr-3">MDR</th>
                  <th className="py-2 pr-3">RT / DT / MD / SD</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {detail.slabs.map((s) => (
                  <tr key={s.id} className="border-b border-ink-50">
                    <td className="py-2.5 pr-3 font-semibold">{s.serviceKind}</td>
                    <td className="py-2.5 pr-3">{s.paymentMode}</td>
                    <td className="py-2.5 pr-3">
                      {formatINR(s.minAmount)} – {formatINR(s.maxAmount)}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-brand-700">
                      {fmtRate(s.mdrType, s.mdrValue)}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-ink-600">
                      {fmtRate(s.commissionType, s.commissionRetailer)} /{" "}
                      {fmtRate(s.commissionType, s.commissionDistributor)} /{" "}
                      {fmtRate(s.commissionType, s.commissionMaster)} /{" "}
                      {fmtRate(s.commissionType, s.commissionSuperDistributor)}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                        title="Delete slab"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {detail.slabs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-ink-400">
                      No slabs — add the first one below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-xl bg-ink-50/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Add slab {form.mdrType === "PERCENT" && "(rates in %, e.g. 0.5 = 0.5%)"}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <label className="text-xs text-ink-500">
                Service
                <select className={`${inputCls} mt-1 w-full`} value={form.serviceKind} onChange={set("serviceKind")}>
                  {SERVICE_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-500">
                Mode (* = any)
                <input className={`${inputCls} mt-1 w-full`} value={form.paymentMode} onChange={set("paymentMode")} />
              </label>
              <label className="text-xs text-ink-500">
                Min ₹
                <input type="number" className={`${inputCls} mt-1 w-full`} value={form.minAmount} onChange={set("minAmount")} />
              </label>
              <label className="text-xs text-ink-500">
                Max ₹
                <input type="number" className={`${inputCls} mt-1 w-full`} value={form.maxAmount} onChange={set("maxAmount")} />
              </label>
              <label className="text-xs text-ink-500">
                MDR type
                <select className={`${inputCls} mt-1 w-full`} value={form.mdrType} onChange={set("mdrType")}>
                  <option>PERCENT</option>
                  <option>FLAT</option>
                </select>
              </label>
              <label className="text-xs text-ink-500">
                MDR value
                <input type="number" step="0.01" className={`${inputCls} mt-1 w-full`} value={form.mdrValue} onChange={set("mdrValue")} />
              </label>
              <label className="text-xs text-ink-500">
                Commission type
                <select className={`${inputCls} mt-1 w-full`} value={form.commissionType} onChange={set("commissionType")}>
                  <option>PERCENT</option>
                  <option>FLAT</option>
                </select>
              </label>
              <label className="text-xs text-ink-500">
                Retailer
                <input type="number" step="0.01" className={`${inputCls} mt-1 w-full`} value={form.commissionRetailer} onChange={set("commissionRetailer")} />
              </label>
              <label className="text-xs text-ink-500">
                Distributor
                <input type="number" step="0.01" className={`${inputCls} mt-1 w-full`} value={form.commissionDistributor} onChange={set("commissionDistributor")} />
              </label>
              <label className="text-xs text-ink-500">
                Master Dist.
                <input type="number" step="0.01" className={`${inputCls} mt-1 w-full`} value={form.commissionMaster} onChange={set("commissionMaster")} />
              </label>
              <label className="text-xs text-ink-500">
                Super Dist.
                <input type="number" step="0.01" className={`${inputCls} mt-1 w-full`} value={form.commissionSuperDistributor} onChange={set("commissionSuperDistributor")} />
              </label>
              <div className="flex items-end">
                <Button size="sm" onClick={addSlab} disabled={busy} className="w-full" isLoading={busy}>
                  Add slab
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        busy={deleting}
        title="Delete this slab?"
        description={
          deleteTarget && (
            <>
              The <span className="font-semibold text-ink-900">{deleteTarget.serviceKind}</span> slab covering{" "}
              <span className="font-semibold text-ink-900">
                {formatINR(deleteTarget.minAmount)} – {formatINR(deleteTarget.maxAmount)}
              </span>{" "}
              will be removed from this scheme.
            </>
          )
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await removeSlab(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------- create modal */

function CreateSchemeModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (text: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mdr-schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, isDefault }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Create failed");
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-base font-bold text-ink-900">New MDR scheme</h3>
        <div className="space-y-3">
          <label className="block text-xs text-ink-500">
            Name
            <input className={`${inputCls} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Acquiring" />
          </label>
          <label className="block text-xs text-ink-500">
            Description (optional)
            <input className={`${inputCls} mt-1 w-full`} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Make this the platform default
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 2} isLoading={busy}>
            Create scheme
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- diagnose modal */

function DiagnoseModal({ onClose }: { onClose: () => void }) {
  const [userQuery, setUserQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [matches, setMatches] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [serviceKind, setServiceKind] = useState("POS");
  const [paymentMode, setPaymentMode] = useState("*");
  const [amount, setAmount] = useState("1000");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (userQuery.length < 3) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/network?q=${encodeURIComponent(userQuery)}&pageSize=5`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) =>
          setMatches(
            (d?.users ?? []).map((u: { id: string; name: string; email: string }) => ({
              id: u.id,
              name: u.name,
              email: u.email,
            }))
          )
        )
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [userQuery]);

  const run = async () => {
    if (!userId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/mdr-schemes/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, serviceKind, paymentMode, amount: Number(amount) }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  };

  const commission = (result?.commission ?? null) as Record<string, number> | null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-bold text-ink-900">MDR diagnostics</h3>
        <p className="mb-4 text-xs text-ink-400">
          Simulate which scheme &amp; slab a transaction resolves to — nothing is charged.
        </p>
        <div className="space-y-3">
          <label className="block text-xs text-ink-500">
            User (search name / email / phone)
            <input
              className={`${inputCls} mt-1 w-full`}
              value={userQuery}
              onChange={(e) => {
                setUserQuery(e.target.value);
                setUserId("");
              }}
              placeholder="min 3 characters"
            />
          </label>
          {matches.length > 0 && !userId && (
            <div className="rounded-xl border border-ink-100">
              {matches.map((m) => (
                <button
                  key={m.id}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50"
                  onClick={() => {
                    setUserId(m.id);
                    setUserQuery(`${m.name} (${m.email})`);
                    setMatches([]);
                  }}
                >
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-xs text-ink-400">{m.email}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-ink-500">
              Service
              <select className={`${inputCls} mt-1 w-full`} value={serviceKind} onChange={(e) => setServiceKind(e.target.value)}>
                {SERVICE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-500">
              Mode
              <input className={`${inputCls} mt-1 w-full`} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} />
            </label>
            <label className="text-xs text-ink-500">
              Amount ₹
              <input type="number" className={`${inputCls} mt-1 w-full`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
        </div>

        {result && (
          <div className="mt-4 rounded-xl bg-ink-50 p-4 text-sm">
            {result.resolved ? (
              <>
                <p>
                  <Badge variant="brand">{String(result.source).replace(/_/g, " ").toLowerCase()}</Badge>{" "}
                  <span className="font-semibold">{String(result.schemeName)}</span>
                </p>
                <p className="mt-2">
                  MDR charged: <span className="font-bold text-brand-700">{formatINR(Number(result.mdr))}</span>
                </p>
                {commission && (
                  <p className="mt-1 text-xs text-ink-600">
                    Commission — RT {formatINR(commission.retailer)} · DT {formatINR(commission.distributor)} · MD{" "}
                    {formatINR(commission.master)} · SD {formatINR(commission.superDistributor)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-ink-600">{String(result.message ?? result.error ?? "No result")}</p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={run} disabled={busy || !userId} isLoading={busy}>
            Run diagnosis
          </Button>
        </div>
      </div>
    </div>
  );
}
