"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Filter, MoreHorizontal, ShieldOff, ShieldCheck, RefreshCw, Loader2, Power, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { formatINR } from "@/lib/utils";

type UserRow = {
  id: string;
  name: string;
  shop: string;
  role: "retailer" | "distributor" | "master-distributor" | "super-distributor";
  city: string;
  state: string;
  joined: string;
  status: "Active" | "Pending KYC" | "Suspended" | "Closed";
  walletBalance: number;
  monthlyTurnover: number;
  retailers: number;
};

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [servicesUser, setServicesUser] = useState<UserRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (role !== "all") params.set("role", role);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [q, role, status]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  async function toggleStatus(userId: string, currentStatus: string) {
    setActing(userId);
    try {
      const action = currentStatus === "Active" ? "suspend" : "activate";
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchUsers();
    } catch {
      // silent
    } finally {
      setActing(null);
    }
  }

  function toggleSelected(userId: string) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const columns: Column<UserRow>[] = [
    {
      key: "select",
      header: "",
      align: "center",
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.includes(r.id)}
          onChange={() => toggleSelected(r.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          aria-label={`Select ${r.name}`}
        />
      ),
    },
    {
      key: "name",
      header: "User",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.name}</div>
          <div className="text-xs text-ink-500">{r.shop} · {r.id.slice(0, 8)}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <Badge variant={r.role === "super-distributor" ? "warning" : r.role === "master-distributor" ? "accent" : r.role === "distributor" ? "brand" : "default"}>
          {r.role}
        </Badge>
      ),
    },
    { key: "city", header: "Location", render: (r) => `${r.city}, ${r.state}` },
    { key: "joined", header: "Joined" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "success" : r.status === "Pending KYC" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "walletBalance", header: "Wallet", align: "right", render: (r) => formatINR(r.walletBalance) },
    { key: "monthlyTurnover", header: "MTD", align: "right", render: (r) => formatINR(r.monthlyTurnover) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => setServicesUser(r)}
            className="grid h-8 w-8 place-items-center rounded-lg text-violet-700 hover:bg-violet-50"
            title="Manage services"
          >
            <Power className="h-4 w-4" />
          </button>
          {acting === r.id ? (
            <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
          ) : r.status === "Active" ? (
            <button
              onClick={() => toggleStatus(r.id, r.status)}
              className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50"
              title="Suspend"
            >
              <ShieldOff className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => toggleStatus(r.id, r.status)}
              className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50"
              title="Reactivate"
            >
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" title="More">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Users & shops"
        description="Search, filter and manage every retailer, distributor and master across the platform."
        actions={
          <>
            <ReportActions
              filename="users"
              title="JMP NextGenPay · Users & Shops"
              subtitle={`${users.length} users`}
              columns={[
                { key: "id", header: "ID" },
                { key: "name", header: "Name" },
                { key: "shop", header: "Shop / Firm" },
                { key: "role", header: "Role" },
                { key: "city", header: "City" },
                { key: "state", header: "State" },
                { key: "joined", header: "Joined" },
                { key: "status", header: "Status" },
                { key: "walletBalance", header: "Wallet (INR)" },
                { key: "monthlyTurnover", header: "MTD Turnover (INR)" },
              ]}
              rows={users}
            />
            <Button variant="outline" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            placeholder="Search name, shop, city..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 w-44">
            <option value="all">All roles</option>
            <option value="retailer">Retailers</option>
            <option value="distributor">Distributors</option>
            <option value="master-distributor">Master distributors</option>
            <option value="super-distributor">Super distributors</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-44">
            <option value="all">Any status</option>
            <option value="Active">Active</option>
            <option value="Pending KYC">Pending KYC</option>
            <option value="Suspended">Suspended</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3">
        <p className="text-sm text-ink-700">
          <span className="font-semibold">{selected.length}</span> selected
        </p>
        <button
          type="button"
          onClick={() => setSelected(users.map((u) => u.id))}
          className="text-xs font-medium text-brand-700 hover:underline"
          disabled={users.length === 0}
        >
          Select all visible
        </button>
        <button
          type="button"
          onClick={() => setSelected([])}
          className="text-xs font-medium text-ink-500 hover:underline"
          disabled={selected.length === 0}
        >
          Clear
        </button>
        <div className="ml-auto">
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            disabled={selected.length === 0}
          >
            <Power className="mr-2 h-4 w-4" />
            Bulk services ({selected.length})
          </Button>
        </div>
      </div>

      <DataTable
        title={loading ? "Loading..." : `${users.length} users`}
        description="Click on a row to view full profile, ledger and transactions."
        columns={columns}
        data={users}
        empty="No users match your filters."
      />

      {servicesUser && (
        <UserServicesDialog
          userId={servicesUser.id}
          userName={servicesUser.name}
          onClose={() => setServicesUser(null)}
        />
      )}

      {bulkOpen && (
        <BulkServicesDialog
          userIds={selected}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected([]);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */

type ServiceItem = {
  id: string;
  key: string;
  name: string;
  kind: string;
  enabled: boolean;
};

function UserServicesDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [allServices, setAllServices] = useState<ServiceItem[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/users/${userId}/services`);
        const data = await res.json();
        if (res.ok) {
          setAllServices(data.allServices ?? []);
          setEnabledKeys(data.enabledServices ?? []);
        }
      } catch {
        setNotice({ text: "Failed to load services", ok: false });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  function toggleService(key: string) {
    setEnabledKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function enableAll() {
    setEnabledKeys(allServices.map((s) => s.key));
  }

  function disableAll() {
    setEnabledKeys([]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/services`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledServices: enabledKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      setNotice({ text: "Services updated successfully!", ok: true });
      setTimeout(onClose, 1200);
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Failed to save", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ServiceItem[]>();
    for (const s of allServices) {
      const arr = map.get(s.kind) ?? [];
      arr.push(s);
      map.set(s.kind, arr);
    }
    return Array.from(map.entries());
  }, [allServices]);

  const enabledCount = enabledKeys.length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-violet-50 to-white px-6 py-5 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">
              Manage services
            </p>
            <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
              {userName}
            </h3>
            <p className="mt-1 text-xs text-ink-600">
              Services are OFF by default — tick the ones this user may access. Changes apply immediately.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notice && (
          <div
            className={`mx-6 mt-3 rounded-xl border px-4 py-2.5 text-sm font-medium ${
              notice.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="text-center text-sm text-ink-500 py-10">Loading services…</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-ink-700">
                  <span className="font-semibold text-emerald-700">{enabledCount}</span> of{" "}
                  <span className="font-semibold">{allServices.length}</span> services enabled
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={enableAll}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Enable all
                  </button>
                  <span className="text-ink-300">|</span>
                  <button
                    type="button"
                    onClick={disableAll}
                    className="text-xs font-medium text-rose-700 hover:underline"
                  >
                    Disable all
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {grouped.map(([kind, items]) => (
                  <div key={kind}>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink-500 mb-2">
                      {kind}
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((svc) => {
                        const isEnabled = enabledKeys.includes(svc.key);
                        const isGloballyOff = !svc.enabled;
                        return (
                          <label
                            key={svc.key}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                              isGloballyOff
                                ? "border-ink-100 bg-ink-50 text-ink-400 cursor-not-allowed"
                                : isEnabled
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-ink-200 bg-white text-ink-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={isGloballyOff}
                              onChange={() => toggleService(svc.key)}
                              className="h-4 w-4 rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="flex-1 truncate">{svc.name}</span>
                            {isGloballyOff && (
                              <Badge variant="danger">Global OFF</Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/40 px-6 py-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save services"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */

function BulkServicesDialog({
  userIds,
  onClose,
  onDone,
}: {
  userIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [allServices, setAllServices] = useState<ServiceItem[]>([]);
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"enable" | "disable" | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/services`);
        const data = await res.json();
        if (res.ok) {
          const items: ServiceItem[] = (data.services ?? data.routes ?? []).filter(
            (s: ServiceItem & { type?: string }) => (s.type ?? "SERVICE") === "SERVICE"
          );
          setAllServices(items);
        }
      } catch {
        setNotice({ text: "Failed to load services", ok: false });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function togglePicked(key: string) {
    setPickedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function apply(action: "enable" | "disable") {
    setSaving(action);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/services/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, serviceKeys: pickedKeys, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      setNotice({
        text: `${action === "enable" ? "Enabled" : "Disabled"} ${pickedKeys.length} service(s) for ${data.updated} user(s).`,
        ok: true,
      });
      setTimeout(onDone, 1200);
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Failed to save", ok: false });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-brand-50 to-white px-6 py-5 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-700">
              Bulk manage services
            </p>
            <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
              {userIds.length} user{userIds.length === 1 ? "" : "s"} selected
            </h3>
            <p className="mt-1 text-xs text-ink-600">
              Pick services, then enable or disable them for every selected user in one go.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notice && (
          <div
            className={`mx-6 mt-3 rounded-xl border px-4 py-2.5 text-sm font-medium ${
              notice.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="text-center text-sm text-ink-500 py-10">Loading services…</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-ink-700">
                  <span className="font-semibold text-brand-700">{pickedKeys.length}</span> of{" "}
                  <span className="font-semibold">{allServices.length}</span> services picked
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPickedKeys(allServices.map((s) => s.key))}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Pick all
                  </button>
                  <span className="text-ink-300">|</span>
                  <button
                    type="button"
                    onClick={() => setPickedKeys([])}
                    className="text-xs font-medium text-ink-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {allServices.map((svc) => {
                  const picked = pickedKeys.includes(svc.key);
                  return (
                    <label
                      key={svc.key}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                        picked
                          ? "border-brand-200 bg-brand-50 text-brand-800"
                          : "border-ink-200 bg-white text-ink-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => togglePicked(svc.key)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="flex-1 truncate">{svc.name}</span>
                      {!svc.enabled && <Badge variant="danger">Global OFF</Badge>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/40 px-6 py-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => apply("disable")}
            disabled={saving !== null || loading || pickedKeys.length === 0}
          >
            {saving === "disable" ? "Disabling..." : "Disable for selected"}
          </Button>
          <Button
            onClick={() => apply("enable")}
            disabled={saving !== null || loading || pickedKeys.length === 0}
          >
            {saving === "enable" ? "Enabling..." : "Enable for selected"}
          </Button>
        </div>
      </div>
    </div>
  );
}
