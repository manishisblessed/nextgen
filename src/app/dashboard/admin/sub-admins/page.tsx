"use client";

import { useEffect, useMemo, useState } from "react";
import {
  UserCog,
  Plus,
  Copy,
  Check,
  ShieldOff,
  ShieldCheck,
  Trash2,
  KeyRound,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { getSession } from "@/lib/auth";
import { generateRandomPassword } from "@/lib/utils";
import {
  createSubAdmin,
  deleteSubAdmin,
  listSubAdmins,
  setSubAdminStatus,
  type SubAdminRecord
} from "@/lib/subAdmins";

export default function AdminSubAdminsPage() {
  const [rows, setRows] = useState<SubAdminRecord[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [issued, setIssued] = useState<{
    record: SubAdminRecord;
    password: string;
  } | null>(null);

  const refresh = () => setRows(listSubAdmins());
  useEffect(refresh, []);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "Active").length;
    const pendingFirstLogin = rows.filter((r) => r.mustChangePassword).length;
    return { total: rows.length, active, pendingFirstLogin };
  }, [rows]);

  const cols: Column<SubAdminRecord>[] = [
    {
      key: "id",
      header: "Code",
      render: (r) => <span className="font-mono text-xs">{r.id}</span>
    },
    {
      key: "name",
      header: "Sub-admin",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.name}</div>
          <div className="text-xs text-ink-500">{r.email}</div>
        </div>
      )
    },
    { key: "phone", header: "Mobile" },
    {
      key: "mustChangePassword",
      header: "Password",
      render: (r) =>
        r.mustChangePassword ? (
          <Badge variant="warning">Awaiting first change</Badge>
        ) : (
          <Badge variant="success">Self-set</Badge>
        )
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "success" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    {
      key: "createdAt",
      header: "Created",
      render: (r) => new Date(r.createdAt).toLocaleString("en-IN")
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.status === "Active" ? (
            <button
              onClick={() => {
                setSubAdminStatus(r.email, "Suspended");
                refresh();
              }}
              className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50"
              title="Suspend"
            >
              <ShieldOff className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                setSubAdminStatus(r.email, "Active");
                refresh();
              }}
              className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50"
              title="Reactivate"
            >
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (
                confirm(`Delete sub-admin ${r.name}? This cannot be undone.`)
              ) {
                deleteSubAdmin(r.email);
                refresh();
              }
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Sub-admins"
        description="Create operations users delegated by you. Each sub-admin signs in at /sub-admin and is forced to change the auto-generated password on first login."
        actions={
          <>
            <ReportActions
              filename="sub-admins"
              title="JMP NextGenPay · Sub-Admins"
              columns={[
                { key: "id", header: "Code" },
                { key: "name", header: "Name" },
                { key: "email", header: "Email" },
                { key: "phone", header: "Mobile" },
                { key: "status", header: "Status" },
                {
                  key: "mustChangePassword",
                  header: "Awaiting first change",
                  render: (r) => (r.mustChangePassword ? "Yes" : "No")
                },
                {
                  key: "createdAt",
                  header: "Created",
                  render: (r) => new Date(r.createdAt).toLocaleString("en-IN")
                }
              ]}
              rows={rows}
            />
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> Create sub-admin
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total sub-admins" value={stats.total} tone="brand" />
        <Stat label="Active" value={stats.active} tone="success" />
        <Stat
          label="Awaiting first login change"
          value={stats.pendingFirstLogin}
          tone="warning"
        />
      </div>

      {showNew && (
        <NewSubAdminForm
          onCancel={() => setShowNew(false)}
          onCreated={(record, password) => {
            setShowNew(false);
            setIssued({ record, password });
            refresh();
          }}
        />
      )}

      {issued && (
        <CredentialsDialog
          record={issued.record}
          password={issued.password}
          onClose={() => setIssued(null)}
        />
      )}

      <DataTable
        title={`${rows.length} sub-admins`}
        description="Sub-admins log in at /sub-admin and inherit a restricted operations dashboard."
        columns={cols}
        data={rows}
        empty="No sub-admins created yet. Click 'Create sub-admin' to issue the first credentials."
      />
    </div>
  );
}

/* ----------------------------------------------------------------------- */

function NewSubAdminForm({
  onCancel,
  onCreated
}: {
  onCancel: () => void;
  onCreated: (r: SubAdminRecord, password: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = getSession();
      const password = generateRandomPassword(10);
      const record = await createSubAdmin({
        name,
        email,
        phone,
        plainPassword: password,
        createdBy: session?.email ?? "admin"
      });
      onCreated(record, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-white p-5"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-white">
          <UserCog className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-display text-base font-semibold text-ink-900">
            New sub-admin
          </h3>
          <p className="text-xs text-ink-500">
            A 10-character password will be generated. Share it once — the
            sub-admin must change it on first login.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="sa-name">Full name</Label>
          <Input
            id="sa-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As per ID proof"
          />
        </div>
        <div>
          <Label htmlFor="sa-email">Email</Label>
          <Input
            id="sa-email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ops.user@jmpnextgenpay.com"
          />
        </div>
        <div>
          <Label htmlFor="sa-phone">Mobile</Label>
          <Input
            id="sa-phone"
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 9XXXXXXXXX"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          <KeyRound className="h-4 w-4" />
          {submitting ? "Generating..." : "Generate password & create"}
        </Button>
      </div>
    </form>
  );
}

function CredentialsDialog({
  record,
  password,
  onClose
}: {
  record: SubAdminRecord;
  password: string;
  onClose: () => void;
}) {
  const [showPwd, setShowPwd] = useState(true);
  const [copied, setCopied] = useState<"none" | "email" | "pwd" | "both">(
    "none"
  );

  const copy = async (
    text: string,
    which: "email" | "pwd" | "both"
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied("none"), 1800);
    } catch {
      /* ignore */
    }
  };

  const both = `Login URL: ${typeof window !== "undefined" ? window.location.origin : ""}/sub-admin\nEmail: ${record.email}\nPassword: ${password}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-emerald-50 to-white px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Sub-admin created
            </p>
            <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
              {record.name}{" "}
              <span className="font-mono text-xs text-ink-500">
                · {record.id}
              </span>
            </h3>
            <p className="mt-1 text-xs text-ink-600">
              Share these credentials securely. The sub-admin will be forced to
              change this password on first login.
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

        <div className="space-y-3 px-6 py-5">
          <Field label="Login URL" value="/sub-admin" />
          <Field
            label="Email"
            value={record.email}
            action={
              <button
                type="button"
                onClick={() => copy(record.email, "email")}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
                title="Copy email"
              >
                {copied === "email" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            }
          />
          <Field
            label="Temporary password"
            mono
            value={showPwd ? password : "••••••••••"}
            action={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
                  title={showPwd ? "Hide" : "Show"}
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => copy(password, "pwd")}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
                  title="Copy password"
                >
                  {copied === "pwd" ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            }
          />

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            For security, this password will{" "}
            <strong>not be shown again</strong>. Copy it now and send it to the
            sub-admin via a secure channel.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/40 px-6 py-3">
          <Button variant="outline" onClick={() => copy(both, "both")}>
            {copied === "both" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy all
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  action
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p
          className={`truncate text-sm text-ink-900 ${mono ? "font-mono" : "font-semibold"}`}
        >
          {value}
        </p>
        {action}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "brand" | "success" | "warning";
}) {
  const map = {
    brand: "from-brand-500 to-brand-700 text-brand-50",
    success: "from-emerald-500 to-emerald-700 text-emerald-50",
    warning: "from-amber-500 to-amber-700 text-amber-50"
  };
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${map[tone]} p-5 shadow-soft`}
    >
      <p className="text-xs font-bold uppercase tracking-widest opacity-90">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
