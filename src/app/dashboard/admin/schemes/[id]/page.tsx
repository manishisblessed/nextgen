"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Label, Select } from "@/components/ui/Input";
import { SERVICE_CODES, serviceGroup } from "@/lib/scheme/constants";
import {
  ArrowLeft,
  Plus,
  Star,
  Loader2,
  Trash2,
  Pencil,
  X,
  Users,
  UserPlus,
  Power,
} from "lucide-react";

type RateType = "FLAT" | "PERCENT";

type Slab = {
  id: string;
  schemeId: string;
  service: string;
  minAmount: number;
  maxAmount: number;
  chargeType: RateType;
  chargeValue: number;
  commissionType: RateType;
  commissionRetailer: number;
  commissionDistributor: number;
  commissionMaster: number;
  /** Cascade model: commission the ASSIGNED user earns on this slab. */
  commissionValue: number;
  active: boolean;
};

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  slabs?: Slab[];
};

type AssignedUser = { id: string; name: string; email: string; role: string };

export default function SchemeEditorPage() {
  const params = useParams<{ id: string }>();
  const schemeId = params.id;

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [assigned, setAssigned] = useState<AssignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const [slabModal, setSlabModal] = useState<{ open: boolean; editing: Slab | null }>({ open: false, editing: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/schemes/${schemeId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setScheme(data.scheme);
      setSlabs(data.scheme.slabs ?? []);
      setAssigned(data.assignedUsers ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load", false);
    } finally {
      setLoading(false);
    }
  }, [schemeId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Slab[]>();
    for (const s of slabs) {
      const arr = map.get(s.service) ?? [];
      arr.push(s);
      map.set(s.service, arr);
    }
    return Array.from(map.entries())
      .map(([service, list]) => [service, list.sort((a, b) => a.minAmount - b.minAmount)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [slabs]);

  async function deleteSlab(slab: Slab) {
    try {
      const res = await fetch(`/api/admin/schemes/${schemeId}/slabs/${slab.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      notify("Slab removed.", true);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", false);
    }
  }

  async function patchScheme(body: Record<string, unknown>, okMsg: string) {
    try {
      const res = await fetch(`/api/admin/schemes/${schemeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      notify(okMsg, true);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", false);
    }
  }

  if (loading && !scheme) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center text-sm text-ink-500">
        Loading scheme…
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/admin/schemes" className="inline-flex items-center gap-1 text-sm text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Back to schemes
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">Scheme not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/admin/schemes" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" /> Back to schemes
      </Link>

      <PageHeader
        eyebrow="Scheme Manager"
        title={scheme.name}
        description={scheme.description ?? "Per-service charge & commission slabs."}
        actions={
          <>
            {!scheme.isDefault && (
              <Button variant="outline" onClick={() => patchScheme({ isDefault: true }, "Marked as default scheme.")}>
                <Star className="h-4 w-4" /> Set default
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => patchScheme({ active: !scheme.active }, scheme.active ? "Scheme deactivated." : "Scheme activated.")}
            >
              <Power className="h-4 w-4" /> {scheme.active ? "Deactivate" : "Activate"}
            </Button>
            <Button onClick={() => setSlabModal({ open: true, editing: null })}>
              <Plus className="h-4 w-4" /> Add slab
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {scheme.isDefault && (
          <Badge variant="accent">
            <Star className="h-3 w-3" /> Platform default
          </Badge>
        )}
        <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "Active" : "Inactive"}</Badge>
        <Badge variant="brand">{slabs.length} slabs</Badge>
        <Badge variant="default">{assigned.length} users assigned</Badge>
      </div>

      {/* Slab grid grouped by service */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-ink-700">No slabs yet</p>
          <p className="mt-1 text-sm text-ink-500">Add per-service amount ranges with their charge and commission split.</p>
          <div className="mt-4 flex justify-center">
            <Button onClick={() => setSlabModal({ open: true, editing: null })}>
              <Plus className="h-4 w-4" /> Add slab
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([service, list]) => (
            <section key={service} className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-5 py-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-ink-900">{service.replace(/_/g, " ")}</h3>
                  <p className="text-xs text-ink-500">{serviceGroup(service)}</p>
                </div>
                <Badge variant="brand">{list.length} slabs</Badge>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-ink-50/40 text-left text-[11px] uppercase tracking-wider text-ink-500">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Range</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Charge</th>
                      <th className="px-5 py-2.5 text-right font-semibold">User Commission</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Retailer</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Distributor</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Master Dist.</th>
                      <th className="px-5 py-2.5 text-center font-semibold">Status</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 text-ink-800">
                    {list.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-brand-50/40">
                        <td className="px-5 py-3 font-medium">
                          ₹{s.minAmount.toLocaleString("en-IN")} – ₹{s.maxAmount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-3 text-right">{fmtRate(s.chargeType, s.chargeValue)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-700">{fmtRate(s.commissionType, s.commissionValue)}</td>
                        <td className="px-5 py-3 text-right">{fmtRate(s.commissionType, s.commissionRetailer)}</td>
                        <td className="px-5 py-3 text-right">{fmtRate(s.commissionType, s.commissionDistributor)}</td>
                        <td className="px-5 py-3 text-right">{fmtRate(s.commissionType, s.commissionMaster)}</td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={s.active ? "success" : "danger"}>{s.active ? "On" : "Off"}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setSlabModal({ open: true, editing: s })}
                              className="grid h-8 w-8 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
                              title="Edit slab"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteSlab(s)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                              title="Delete slab"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <AssignmentPanel
        schemeId={schemeId}
        assigned={assigned}
        onChange={(msg) => {
          notify(msg, true);
          load();
        }}
        onError={(msg) => notify(msg, false)}
      />

      {slabModal.open && (
        <SlabModal
          schemeId={schemeId}
          editing={slabModal.editing}
          onClose={() => setSlabModal({ open: false, editing: null })}
          onSaved={(msg) => {
            setSlabModal({ open: false, editing: null });
            notify(msg, true);
            load();
          }}
        />
      )}
    </div>
  );
}

function fmtRate(type: RateType, value: number): string {
  if (value === 0) return "—";
  return type === "FLAT" ? `₹${value.toLocaleString("en-IN")}` : `${(value * 100).toFixed(2)}%`;
}

function SlabModal({
  schemeId,
  editing,
  onClose,
  onSaved,
}: {
  schemeId: string;
  editing: Slab | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!editing;
  const [service, setService] = useState<string>(editing?.service ?? SERVICE_CODES[0]);
  const [minAmount, setMinAmount] = useState(String(editing?.minAmount ?? 0));
  const [maxAmount, setMaxAmount] = useState(String(editing?.maxAmount ?? 1000));
  const [chargeType, setChargeType] = useState<RateType>(editing?.chargeType ?? "FLAT");
  // For PERCENT we edit in human percent (0.5) and store as fraction (0.005).
  const [chargeValue, setChargeValue] = useState(
    String(editing ? (editing.chargeType === "PERCENT" ? editing.chargeValue * 100 : editing.chargeValue) : 0)
  );
  const [commissionType, setCommissionType] = useState<RateType>(editing?.commissionType ?? "PERCENT");
  const [comR, setComR] = useState(
    String(editing ? (editing.commissionType === "PERCENT" ? editing.commissionRetailer * 100 : editing.commissionRetailer) : 0)
  );
  const [comD, setComD] = useState(
    String(editing ? (editing.commissionType === "PERCENT" ? editing.commissionDistributor * 100 : editing.commissionDistributor) : 0)
  );
  const [comM, setComM] = useState(
    String(editing ? (editing.commissionType === "PERCENT" ? editing.commissionMaster * 100 : editing.commissionMaster) : 0)
  );
  // Cascade model: commission the assigned user earns on this slab.
  const [comOwn, setComOwn] = useState(
    String(editing ? (editing.commissionType === "PERCENT" ? editing.commissionValue * 100 : editing.commissionValue) : 0)
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
    if (!isFinite(min) || !isFinite(max) || min < 0 || max < 0) {
      setError("Enter valid amounts.");
      return;
    }
    if (max < min) {
      setError("Max amount must be ≥ min amount.");
      return;
    }
    setSaving(true);

    const payload = {
      service,
      minAmount: min,
      maxAmount: max,
      chargeType,
      chargeValue: toStored(chargeType, chargeValue),
      commissionType,
      commissionRetailer: toStored(commissionType, comR),
      commissionDistributor: toStored(commissionType, comD),
      commissionMaster: toStored(commissionType, comM),
      commissionValue: toStored(commissionType, comOwn),
    };

    try {
      const url = isEdit
        ? `/api/admin/schemes/${schemeId}/slabs/${editing!.id}`
        : `/api/admin/schemes/${schemeId}/slabs`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // On edit we don't resend `service` (immutable per slab) but the PATCH ignores it.
        body: JSON.stringify(isEdit ? { ...payload, service: undefined } : payload),
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

  const pctHint = "Enter as percent, e.g. 0.5 for 0.5%";
  const flatHint = "Flat ₹ amount per transaction";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-100 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-100 bg-gradient-to-r from-brand-500 to-sky-500 px-5 py-4 text-white">
          <h3 className="font-display text-base font-semibold">{isEdit ? "Edit slab" : "Add slab"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div>
            <Label>Service</Label>
            <Select value={service} onChange={(e) => setService(e.target.value)} disabled={isEdit}>
              {SERVICE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
            {isEdit && <p className="mt-1 text-xs text-ink-400">Service is fixed for an existing slab.</p>}
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

          <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">Customer charge</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={chargeType} onChange={(e) => setChargeType(e.target.value as RateType)}>
                  <option value="FLAT">Flat (₹)</option>
                  <option value="PERCENT">Percent (%)</option>
                </Select>
              </div>
              <div>
                <Label>{chargeType === "PERCENT" ? "Charge (%)" : "Charge (₹)"}</Label>
                <Input type="number" min={0} step="0.0001" value={chargeValue} onChange={(e) => setChargeValue(e.target.value)} />
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-400">{chargeType === "PERCENT" ? pctHint : flatHint}</p>
          </div>

          <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">Commission split across levels</p>
            <div className="mb-3">
              <Label>Type</Label>
              <Select value={commissionType} onChange={(e) => setCommissionType(e.target.value as RateType)}>
                <option value="PERCENT">Percent (%)</option>
                <option value="FLAT">Flat (₹)</option>
              </Select>
            </div>
            <div className="mb-3">
              <Label>Assigned user&apos;s commission (cascade)</Label>
              <Input type="number" min={0} step="0.0001" value={comOwn} onChange={(e) => setComOwn(e.target.value)} />
              <p className="mt-1 text-xs text-ink-400">
                What the user this scheme is assigned to earns per transaction. Parents up the
                chain earn scheme-difference margins automatically.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Retailer</Label>
                <Input type="number" min={0} step="0.0001" value={comR} onChange={(e) => setComR(e.target.value)} />
              </div>
              <div>
                <Label>Distributor</Label>
                <Input type="number" min={0} step="0.0001" value={comD} onChange={(e) => setComD(e.target.value)} />
              </div>
              <div>
                <Label>Master Dist.</Label>
                <Input type="number" min={0} step="0.0001" value={comM} onChange={(e) => setComM(e.target.value)} />
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-400">{commissionType === "PERCENT" ? pctHint : flatHint}</p>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-100 bg-white px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {isEdit ? "Save" : "Add slab"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AssignmentPanel({
  schemeId,
  assigned,
  onChange,
  onError,
}: {
  schemeId: string;
  assigned: AssignedUser[];
  onChange: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [role, setRole] = useState("SUPER_DISTRIBUTOR");
  const [assigningRole, setAssigningRole] = useState(false);
  const [assignRoleConfirmOpen, setAssignRoleConfirmOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; role: string }[]>([]);
  const [searching, setSearching] = useState(false);

  async function assignByRole() {
    setAssigningRole(true);
    try {
      const res = await fetch("/api/admin/schemes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Assign failed");
      onChange(`Assigned to ${data.updated} ${role.replace(/_/g, " ").toLowerCase()} user(s).`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setAssigningRole(false);
    }
  }

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query.trim())}&pageSize=10`);
      const data = await res.json();
      setResults((data.users ?? []).map((u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role })));
    } catch {
      onError("Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function assignUser(userId: string) {
    try {
      const res = await fetch("/api/admin/schemes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeId, userIds: [userId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Assign failed");
      onChange("User assigned to scheme.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Assign failed");
    }
  }

  async function unassignUser(userId: string) {
    try {
      const res = await fetch("/api/admin/schemes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeId: null, userIds: [userId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Unassign failed");
      onChange("User unassigned — they are blocked from transacting until a scheme is assigned.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unassign failed");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-gradient-to-r from-violet-50 to-brand-50 px-5 py-3">
        <Users className="h-4 w-4 text-violet-600" />
        <h3 className="font-display text-sm font-semibold text-ink-900">Assignment</h3>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Assign by level */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Assign to a whole level</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Role</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="SUPER_DISTRIBUTOR">Super Distributor</option>
              </Select>
              <p className="mt-1 text-xs text-ink-400">
                Cascade model: admin assigns platform schemes to super-distributors only. Lower
                tiers receive schemes derived by their parent.
              </p>
            </div>
            <Button onClick={() => setAssignRoleConfirmOpen(true)} disabled={assigningRole}>
              {assigningRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Assign
            </Button>
          </div>

          <p className="pt-2 text-xs font-bold uppercase tracking-widest text-ink-500">Assign a specific user</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Search by name / email / id</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Type ≥ 2 characters"
              />
            </div>
            <Button variant="outline" onClick={search} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
              {results.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-ink-900">{u.name}</span>
                    <span className="ml-2 text-xs text-ink-500">{u.role}</span>
                  </span>
                  <button onClick={() => assignUser(u.id)} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                    Assign
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Currently assigned */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Currently assigned ({assigned.length})</p>
          {assigned.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-500">
              No users assigned. Users without a scheme are blocked from transacting.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100">
              {assigned.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">{u.name}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {u.email} · {u.role}
                    </span>
                  </span>
                  <button
                    onClick={() => unassignUser(u.id)}
                    className="ml-2 shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={assignRoleConfirmOpen}
        onClose={() => setAssignRoleConfirmOpen(false)}
        busy={assigningRole}
        tone="default"
        title={`Assign scheme to all ${role.replace(/_/g, " ").toLowerCase()}s?`}
        description={
          <>
            This scheme will be assigned to <span className="font-semibold text-ink-900">ALL {role.replace(/_/g, " ").toLowerCase()}</span> users, overriding their current scheme.
          </>
        }
        confirmLabel="Assign to all"
        onConfirm={async () => {
          await assignByRole();
          setAssignRoleConfirmOpen(false);
        }}
      />
    </section>
  );
}
