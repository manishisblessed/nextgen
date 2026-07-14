"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import {
  RefreshCw,
  Plus,
  Layers,
  Star,
  Users,
  SlidersHorizontal,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";

type Scheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  slabCount: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

const CARD_GRADIENTS = [
  "from-violet-500 to-brand-500",
  "from-brand-500 to-sky-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-fuchsia-500 to-pink-500",
  "from-indigo-500 to-blue-500",
  "from-rose-500 to-red-500",
  "from-cyan-500 to-blue-500",
];

export default function SchemesPage() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const fetchSchemes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/schemes");
      const data = await res.json();
      if (Array.isArray(data.schemes)) setSchemes(data.schemes);
    } catch {
      notify("Failed to load schemes.", false);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchSchemes();
  }, [fetchSchemes]);

  const makeDefault = useCallback(
    async (s: Scheme) => {
      if (s.isDefault) return;
      setBusyId(s.id);
      try {
        const res = await fetch(`/api/admin/schemes/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Update failed");
        notify(`"${s.name}" is now the default scheme.`, true);
        await fetchSchemes();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Update failed", false);
      } finally {
        setBusyId(null);
      }
    },
    [fetchSchemes, notify]
  );

  const activeCount = schemes.filter((s) => s.active).length;
  const totalAssigned = schemes.reduce((acc, s) => acc + s.userCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Scheme Manager"
        description="Group per-service charge & commission slabs into named schemes, then assign them to users or whole levels. One scheme is the platform default fallback."
        actions={
          <>
            <Button variant="outline" onClick={fetchSchemes} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New scheme
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total schemes" value={schemes.length} tone="brand" />
        <StatTile label="Active" value={activeCount} tone="emerald" />
        <StatTile label="Users assigned" value={totalAssigned} tone="violet" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center text-sm text-ink-500">
          Loading schemes…
        </div>
      ) : schemes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
          <Layers className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-700">No schemes yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Create your first scheme and add per-service slabs. Mark one as default so existing flows keep working.
          </p>
          <div className="mt-4 flex justify-center">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New scheme
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {schemes.map((s, i) => (
            <SchemeCard
              key={s.id}
              scheme={s}
              gradient={CARD_GRADIENTS[i % CARD_GRADIENTS.length]}
              busy={busyId === s.id}
              onMakeDefault={() => makeDefault(s)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateSchemeModal
          onClose={() => setCreating(false)}
          onCreated={(msg) => {
            setCreating(false);
            notify(msg, true);
            fetchSchemes();
          }}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: "brand" | "emerald" | "violet" }) {
  const tones = {
    brand: "border-brand-200 bg-brand-50 text-brand-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  } as const;
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function SchemeCard({
  scheme,
  gradient,
  busy,
  onMakeDefault,
}: {
  scheme: Scheme;
  gradient: string;
  busy: boolean;
  onMakeDefault: () => void;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-all ${
        scheme.active ? "border-ink-100 hover:shadow-soft" : "border-ink-100 opacity-75"
      }`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-soft`}>
            <Layers className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-ink-900">{scheme.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {scheme.isDefault && (
                <Badge variant="accent">
                  <Star className="h-3 w-3" /> Default
                </Badge>
              )}
              <Badge variant={scheme.active ? "success" : "danger"}>{scheme.active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        </div>
      </div>

      {scheme.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">{scheme.description}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-ink-50 px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-ink-500">
            <SlidersHorizontal className="h-3 w-3" /> Slabs
          </p>
          <p className="mt-0.5 font-display text-lg font-bold text-ink-900">{scheme.slabCount}</p>
        </div>
        <div className="rounded-xl bg-ink-50 px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-ink-500">
            <Users className="h-3 w-3" /> Users
          </p>
          <p className="mt-0.5 font-display text-lg font-bold text-ink-900">{scheme.userCount}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
        {!scheme.isDefault && scheme.active ? (
          <button
            onClick={onMakeDefault}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:text-accent-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />} Set default
          </button>
        ) : (
          <span className="text-xs text-ink-400">{scheme.isDefault ? "Platform default" : "Inactive"}</span>
        )}
        <Link
          href={`/dashboard/admin/schemes/${scheme.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          Open editor <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function CreateSchemeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, isDefault }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to create scheme");
      onCreated(`Scheme "${name.trim()}" created.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create scheme");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 bg-gradient-to-r from-violet-500 to-brand-500 px-5 py-4 text-white">
          <h3 className="font-display text-base font-semibold">New scheme</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          <div>
            <Label htmlFor="scheme-name">Scheme name</Label>
            <Input
              id="scheme-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Retailer 2026"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="scheme-desc">Description (optional)</Label>
            <textarea
              id="scheme-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Who is this scheme for?"
              className="flex w-full rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-900 shadow-sm transition placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-400"
            />
            Make this the platform default scheme
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} isLoading={saving}>
            <Plus className="h-4 w-4" /> Create
          </Button>
        </div>
      </div>
    </div>
  );
}
