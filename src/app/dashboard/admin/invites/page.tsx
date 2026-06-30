"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Eye,
  ChevronDown,
  Search,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";

type Invite = {
  id: string;
  token: string;
  phone: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  parentId: string | null;
  createdAt: string;
  expiresAt: string;
  registeredAt: string | null;
  verifiedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  REGISTERED: "bg-blue-100 text-blue-800",
  VERIFIED: "bg-indigo-100 text-indigo-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  EXPIRED: "bg-gray-100 text-gray-600",
};

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [resending, setResending] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const url = filter
      ? `/api/admin/invite?status=${filter}`
      : "/api/admin/invite";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites);
      setTotal(data.total);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  async function viewDetail(id: string) {
    setSelectedInvite(id);
    const res = await fetch(`/api/admin/invite/${id}`);
    if (res.ok) {
      setDetailData(await res.json());
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    const reason =
      action === "reject"
        ? prompt("Rejection reason (optional):")
        : undefined;
    const res = await fetch(`/api/admin/invite/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    if (res.ok) {
      fetchInvites();
      setSelectedInvite(null);
      setDetailData(null);
    }
  }

  async function handleResend(id: string) {
    setResending(id);
    try {
      const res = await fetch(`/api/admin/invite/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });
      const data = await res.json();
      if (res.ok && data.emailSent) {
        alert("Onboarding email resent successfully!");
      } else if (res.ok && !data.emailSent) {
        alert("Invite found but email delivery failed. Please check email provider settings.");
      } else {
        alert(data.error || "Failed to resend invite");
      }
    } catch {
      alert("Network error — could not resend invite");
    } finally {
      setResending(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Onboarding Invites"
        description="Create and manage onboarding invites for any network role."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus className="h-4 w-4" /> Create Invite
        </Button>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-40"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="REGISTERED">Registered</option>
          <option value="VERIFIED">Verified</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <span className="ml-auto text-sm text-ink-500">
          {total} invite{total !== 1 ? "s" : ""}
        </span>
      </div>

      {showCreate && (
        <CreateInviteForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchInvites();
          }}
        />
      )}

      {selectedInvite && detailData && (
        <InviteDetail
          data={detailData}
          onClose={() => {
            setSelectedInvite(null);
            setDetailData(null);
          }}
          onAction={(action) => handleAction(selectedInvite, action)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center">
          <p className="text-ink-500">No invites found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-ink-700">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-ink-700">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-ink-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-ink-700">Created</th>
                <th className="px-4 py-3 text-right font-semibold text-ink-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {invites.map((inv) => (
                <tr key={inv.id} className="hover:bg-ink-50/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{inv.name || inv.email}</div>
                    <div className="text-xs text-ink-500">{inv.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {inv.role.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {inv.status === "PENDING" && (
                        <button
                          onClick={() => handleResend(inv.id)}
                          disabled={resending === inv.id}
                          title="Resend onboarding email"
                          className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                          {resending === inv.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => viewDetail(inv.id)}
                        className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {(inv.status === "VERIFIED" || inv.status === "REGISTERED") && (
                        <>
                          <button
                            onClick={() => handleAction(inv.id, "approve")}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleAction(inv.id, "reject")}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateInviteForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    phone: "",
    email: "",
    name: "",
    role: "SUPER_DISTRIBUTOR",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: form.phone.replace(/\s/g, ""),
        email: form.email,
        name: form.name || undefined,
        role: form.role,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to create invite");
      return;
    }

    setSuccess(`Invite sent! Link: ${data.invite.onboardingLink}`);
    setTimeout(onCreated, 2000);
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink-900">Create New Invite</h3>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700">✕</button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Mobile Number *</Label>
          <Input
            required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+91 98765 43210"
          />
        </div>
        <div>
          <Label>Email *</Label>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="user@example.com"
          />
        </div>
        <div>
          <Label>Name (optional)</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
          />
        </div>
        <div>
          <Label>Role *</Label>
          <Select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="SUPER_DISTRIBUTOR">Super Distributor</option>
            <option value="MASTER_DISTRIBUTOR">Master Distributor</option>
            <option value="DISTRIBUTOR">Distributor</option>
            <option value="RETAILER">Retailer</option>
          </Select>
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Invite
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function InviteDetail({
  data,
  onClose,
  onAction,
}: {
  data: { invite: Invite; verifications: any[]; registeredUser: any };
  onClose: () => void;
  onAction: (action: "approve" | "reject") => void;
}) {
  const { invite, verifications, registeredUser } = data;

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink-900">
          Invite Details
        </h3>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700">✕</button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-ink-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Contact</p>
          <p className="mt-1 font-semibold">{invite.name || "—"}</p>
          <p className="text-sm text-ink-600">{invite.email}</p>
          <p className="text-sm text-ink-600">{invite.phone}</p>
        </div>
        <div className="rounded-xl bg-ink-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Role & Status</p>
          <p className="mt-1 font-semibold">{invite.role.replace("_", " ")}</p>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[invite.status]}`}>
            {invite.status}
          </span>
        </div>
        <div className="rounded-xl bg-ink-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Timeline</p>
          <p className="mt-1 text-sm">Created: {new Date(invite.createdAt).toLocaleString()}</p>
          {invite.registeredAt && <p className="text-sm">Registered: {new Date(invite.registeredAt).toLocaleString()}</p>}
          {invite.verifiedAt && <p className="text-sm">Verified: {new Date(invite.verifiedAt).toLocaleString()}</p>}
        </div>
      </div>

      {verifications.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold text-ink-700">Verification Results</p>
          <div className="space-y-2">
            {verifications.map((v: any) => (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-xl border px-4 py-2 ${
                  v.status === "Success"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-rose-200 bg-rose-50"
                }`}
              >
                <div>
                  <span className="font-medium">{v.type.replace(/_/g, " ")}</span>
                  {v.verifiedName && (
                    <span className="ml-2 text-sm text-ink-600">— {v.verifiedName}</span>
                  )}
                </div>
                <span className={`text-sm font-semibold ${v.status === "Success" ? "text-emerald-700" : "text-rose-700"}`}>
                  {v.status === "Success" ? "✓ Verified" : "✕ Failed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {registeredUser && (
        <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
          <p className="mb-1 text-sm font-bold text-ink-700">Registered User</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p><span className="text-ink-500">Name:</span> {registeredUser.name}</p>
            <p><span className="text-ink-500">Shop:</span> {registeredUser.shopName ?? "—"}</p>
            <p><span className="text-ink-500">State:</span> {registeredUser.state ?? "—"}</p>
            <p><span className="text-ink-500">City:</span> {registeredUser.city ?? "—"}</p>
          </div>
        </div>
      )}

      {(invite.status === "VERIFIED" || invite.status === "REGISTERED") && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => onAction("approve")}>
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          <Button variant="outline" onClick={() => onAction("reject")}>
            <XCircle className="h-4 w-4" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}
