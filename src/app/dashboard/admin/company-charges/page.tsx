"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatINR } from "@/lib/utils";
import { ShieldCheck, Plus, RefreshCw, Trash2, Pencil, X } from "lucide-react";

type Floor = {
  id: string;
  serviceKind: string;
  paymentMode: string;
  minAmount: number;
  maxAmount: number;
  mdrType: string;
  mdrValue: number;
  mdrValueT0: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const inputCls =
  "rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const SERVICE_KINDS = ["POS", "PG", "QR"] as const;

function fmtRate(type: string, value: number) {
  return type === "PERCENT" ? `${(value * 100).toFixed(2)}%` : formatINR(value);
}

export default function CompanyChargesPage() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Floor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Floor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/company-charges");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setFloors(data.floors);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/company-charges", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Delete failed");
      notify("Floor entry deleted.", true);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleToggle = async (f: Floor) => {
    try {
      const res = await fetch("/api/admin/company-charges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorId: f.id, active: !f.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      notify(f.active ? "Floor deactivated." : "Floor activated.", true);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", false);
    }
  };

  const columns: Column<Floor>[] = [
    {
      key: "service",
      header: "Service",
      render: (f) => (
        <Badge variant={f.serviceKind === "POS" ? "brand" : f.serviceKind === "PG" ? "default" : "warning"}>
          {f.serviceKind}
        </Badge>
      ),
    },
    {
      key: "paymentMode",
      header: "Payment Mode",
      render: (f) => <span className="font-medium">{f.paymentMode === "*" ? "All" : f.paymentMode}</span>,
    },
    {
      key: "band",
      header: "Amount Band",
      render: (f) => (
        <span className="text-ink-600">
          {formatINR(f.minAmount)} – {formatINR(f.maxAmount)}
        </span>
      ),
    },
    {
      key: "mdr",
      header: "Min MDR (T+1)",
      render: (f) => <span className="font-bold text-brand-700">{fmtRate(f.mdrType, f.mdrValue)}</span>,
    },
    {
      key: "mdrT0",
      header: "Min MDR (Instant)",
      render: (f) => (
        <span className="text-ink-600">{f.mdrValueT0 > 0 ? fmtRate(f.mdrType, f.mdrValueT0) : "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (f) => (
        <Badge variant={f.active ? "success" : "danger"}>{f.active ? "active" : "inactive"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (f) => (
        <div className="flex justify-end gap-1.5">
          <button
            onClick={() => {
              setEditing(f);
              setShowForm(true);
            }}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <Button size="sm" variant="outline" onClick={() => handleToggle(f)}>
            {f.active ? "Deactivate" : "Activate"}
          </Button>
          <button
            onClick={() => setDeleteTarget(f)}
            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Charges"
        description="Platform-wide minimum MDR rates for POS, PG, and QR transactions. No scheme or brand rate can be set below these values. This protects the company from under-priced MDR across the entire distribution network."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add floor
            </Button>
          </div>
        }
      />

      {floors.length === 0 && !loading && (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 p-10 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-ink-300" />
          <p className="text-sm font-semibold text-ink-700">No company MDR floors set yet</p>
          <p className="mt-1 text-xs text-ink-400">
            Add your first floor to enforce minimum MDR across all schemes and brands.
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add floor
          </Button>
        </div>
      )}

      {(floors.length > 0 || loading) && <DataTable columns={columns} data={floors} loading={loading} />}

      {showForm && (
        <FloorFormModal
          existing={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            notify(editing ? "Floor updated." : "Floor created.", true);
            load();
          }}
          onError={(t) => notify(t, false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        busy={deleting}
        title="Delete this floor?"
        description={
          deleteTarget && (
            <>
              The{" "}
              <span className="font-semibold text-ink-900">
                {deleteTarget.serviceKind}/{deleteTarget.paymentMode === "*" ? "All" : deleteTarget.paymentMode}
              </span>{" "}
              floor covering{" "}
              <span className="font-semibold text-ink-900">
                {formatINR(deleteTarget.minAmount)} – {formatINR(deleteTarget.maxAmount)}
              </span>{" "}
              will be permanently removed. Schemes and brand rates below this floor will no longer be blocked.
            </>
          )
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await handleDelete(deleteTarget.id);
        }}
      />
    </div>
  );
}

function FloorFormModal({
  existing,
  onClose,
  onSaved,
  onError,
}: {
  existing: Floor | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (text: string) => void;
}) {
  const isEdit = existing !== null;

  const toDisplay = (type: string, val: number) => (type === "PERCENT" ? (val * 100).toFixed(2) : String(val));

  const [form, setForm] = useState({
    serviceKind: existing?.serviceKind ?? "POS",
    paymentMode: existing?.paymentMode ?? "*",
    minAmount: String(existing?.minAmount ?? 0),
    maxAmount: String(existing?.maxAmount ?? 999999999),
    mdrType: existing?.mdrType ?? "PERCENT",
    mdrValue: existing ? toDisplay(existing.mdrType, existing.mdrValue) : "0.50",
    mdrValueT0: existing ? toDisplay(existing.mdrType, existing.mdrValueT0) : "0",
  });
  const [busy, setBusy] = useState(false);

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const toFraction = (v: string, type: string) => (type === "PERCENT" ? Number(v) / 100 : Number(v));

  const submit = async () => {
    setBusy(true);
    try {
      const body = isEdit
        ? {
            floorId: existing.id,
            paymentMode: form.paymentMode.trim() || "*",
            minAmount: Number(form.minAmount),
            maxAmount: Number(form.maxAmount),
            mdrType: form.mdrType,
            mdrValue: toFraction(form.mdrValue, form.mdrType),
            mdrValueT0: toFraction(form.mdrValueT0, form.mdrType),
          }
        : {
            serviceKind: form.serviceKind,
            paymentMode: form.paymentMode.trim() || "*",
            minAmount: Number(form.minAmount),
            maxAmount: Number(form.maxAmount),
            mdrType: form.mdrType,
            mdrValue: toFraction(form.mdrValue, form.mdrType),
            mdrValueT0: toFraction(form.mdrValueT0, form.mdrType),
          };

      const res = await fetch("/api/admin/company-charges", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.fieldErrors
            ? Object.values(data.error.fieldErrors).flat().join(", ")
            : "Save failed";
        throw new Error(msg);
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            {isEdit ? "Edit MDR floor" : "New MDR floor"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {!isEdit && (
            <label className="block text-xs text-ink-500">
              Service
              <select className={`${inputCls} mt-1 w-full`} value={form.serviceKind} onChange={set("serviceKind")}>
                {SERVICE_KINDS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isEdit && (
            <div className="text-xs text-ink-500">
              Service: <span className="font-semibold text-ink-900">{existing.serviceKind}</span>
            </div>
          )}

          <label className="block text-xs text-ink-500">
            Payment mode (* = all modes)
            <input
              className={`${inputCls} mt-1 w-full`}
              value={form.paymentMode}
              onChange={set("paymentMode")}
              placeholder="CARD, UPI, NFC, or *"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-ink-500">
              Min amount (₹)
              <input
                type="number"
                className={`${inputCls} mt-1 w-full`}
                value={form.minAmount}
                onChange={set("minAmount")}
              />
            </label>
            <label className="block text-xs text-ink-500">
              Max amount (₹)
              <input
                type="number"
                className={`${inputCls} mt-1 w-full`}
                value={form.maxAmount}
                onChange={set("maxAmount")}
              />
            </label>
          </div>

          <label className="block text-xs text-ink-500">
            MDR type
            <select className={`${inputCls} mt-1 w-full`} value={form.mdrType} onChange={set("mdrType")}>
              <option>PERCENT</option>
              <option>FLAT</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-ink-500">
              Min MDR (T+1) {form.mdrType === "PERCENT" && "— in %, e.g. 0.50 = 0.50%"}
              <input
                type="number"
                step="0.01"
                className={`${inputCls} mt-1 w-full`}
                value={form.mdrValue}
                onChange={set("mdrValue")}
              />
            </label>
            <label className="block text-xs text-ink-500">
              Min MDR (Instant) {form.mdrType === "PERCENT" && "— 0 = same as T+1"}
              <input
                type="number"
                step="0.01"
                className={`${inputCls} mt-1 w-full`}
                value={form.mdrValueT0}
                onChange={set("mdrValueT0")}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          This floor will block any scheme or brand rate that tries to set an MDR below{" "}
          <strong>
            {form.mdrType === "PERCENT" ? `${Number(form.mdrValue).toFixed(2)}%` : `₹${Number(form.mdrValue)}`}
          </strong>{" "}
          for <strong>{form.serviceKind}</strong>
          {form.paymentMode !== "*" ? ` / ${form.paymentMode}` : ""} transactions.
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} isLoading={busy}>
            {isEdit ? "Update floor" : "Create floor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
