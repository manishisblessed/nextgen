"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Send,
  AlertCircle,
  ChevronLeft,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type DisputeRow = {
  id: string;
  ticketNo: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  txnRefId: string | null;
  slaDueAt: string;
  slaBreachedAt: string | null;
  messageCount: number;
  createdAt: string;
  raisedBy?: { name: string; role: string; phone: string };
};

type DisputeDetail = DisputeRow & {
  description: string;
  resolution: string | null;
  resolvedByName: string | null;
  reopenCount: number;
  messages: Array<{
    id: string;
    body: string;
    fromSupport: boolean;
    authorName: string;
    createdAt: string;
  }>;
};

const STATUS_BADGE: Record<string, "default" | "success" | "warning" | "danger" | "brand" | "accent"> = {
  OPEN: "brand",
  UNDER_REVIEW: "warning",
  AWAITING_USER: "accent",
  RESOLVED: "success",
  REJECTED: "danger",
};

const PRIORITY_BADGE: Record<string, "default" | "warning" | "danger"> = {
  LOW: "default",
  NORMAL: "default",
  HIGH: "warning",
  URGENT: "danger",
};

function SlaCell({ d }: { d: DisputeRow }) {
  if (d.status === "RESOLVED" || d.status === "REJECTED") {
    return <span className="text-xs text-ink-400">Closed</span>;
  }
  if (d.slaBreachedAt) {
    return <Badge variant="danger">SLA breached</Badge>;
  }
  const msLeft = new Date(d.slaDueAt).getTime() - Date.now();
  const hours = Math.floor(msLeft / 3600_000);
  if (msLeft <= 0) return <Badge variant="danger">Overdue</Badge>;
  if (hours < 4) return <Badge variant="warning">{hours < 1 ? "< 1h left" : `${hours}h left`}</Badge>;
  return <span className="text-xs text-ink-500">{hours}h left</span>;
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "breached" | "all">("active");
  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const qs =
        filter === "breached" ? "?breached=true" : filter === "active" ? "" : "";
      const res = await fetch(`/api/disputes${qs}`);
      const d = await res.json();
      if (res.ok) {
        let rows: DisputeRow[] = d.disputes ?? [];
        if (filter === "active") {
          rows = rows.filter((r) => r.status !== "RESOLVED" && r.status !== "REJECTED");
        }
        setDisputes(rows);
      }
    } catch {
      /* keep last data */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function openDetail(id: string) {
    setError(null);
    const res = await fetch(`/api/disputes/${id}`);
    const d = await res.json();
    if (res.ok) setDetail(d.dispute);
    else setError(typeof d.error === "string" ? d.error : "Could not open the ticket");
  }

  async function act(action: "RESOLVE" | "REJECT" | "AWAIT_USER") {
    if (!detail) return;
    if ((action === "RESOLVE" || action === "REJECT") && resolution.trim().length < 5) {
      setError("Write a resolution note first (min 5 characters).");
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${detail.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "AWAIT_USER" ? { action } : { action, resolution: resolution.trim() }
        ),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Action failed");
        return;
      }
      setResolution("");
      await openDetail(detail.id);
      fetchList();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !reply.trim()) return;
    setBusy("reply");
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${detail.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(typeof d.error === "string" ? d.error : "Could not send the reply");
        return;
      }
      setReply("");
      await openDetail(detail.id);
      fetchList();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  const closed = detail?.status === "RESOLVED" || detail?.status === "REJECTED";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Disputes & Support"
        description="Support queue with SLA tracking. Breaches are auto-escalated and alerted to ops every 30 minutes."
        actions={
          <Button variant="outline" onClick={fetchList} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!detail ? (
        <>
          <div className="flex gap-2">
            {(
              [
                { id: "active", label: "Active queue" },
                { id: "breached", label: "SLA breached" },
                { id: "all", label: "All tickets" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
                  filter === t.id
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-100 bg-white text-ink-700 hover:border-ink-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Ticket</th>
                    <th className="px-5 py-3 font-semibold">Raised by</th>
                    <th className="px-5 py-3 font-semibold">Priority</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">SLA</th>
                    <th className="px-5 py-3 font-semibold">Raised</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-800">
                  {disputes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-500">
                        {loading ? "Loading…" : "Queue is clear."}
                      </td>
                    </tr>
                  ) : (
                    disputes.map((d) => (
                      <tr
                        key={d.id}
                        onClick={() => openDetail(d.id)}
                        className="cursor-pointer hover:bg-ink-50/40"
                      >
                        <td className="px-5 py-3">
                          <div className="font-mono text-xs text-ink-500">{d.ticketNo}</div>
                          <div className="max-w-[260px] truncate font-medium text-ink-900">{d.subject}</div>
                          <div className="text-xs text-ink-500">
                            {d.category}
                            {d.txnRefId && <> · {d.txnRefId}</>}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium">{d.raisedBy?.name ?? "—"}</div>
                          <div className="text-xs text-ink-500">
                            {d.raisedBy?.role?.replace(/_/g, " ")} · {d.raisedBy?.phone}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={PRIORITY_BADGE[d.priority] ?? "default"}>{d.priority}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={STATUS_BADGE[d.status] ?? "default"}>{d.status.replace(/_/g, " ")}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <SlaCell d={d} />
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-xs text-ink-500">
                          {new Date(d.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to queue
          </button>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl border border-ink-100 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-500">{detail.ticketNo}</span>
                  <Badge variant={STATUS_BADGE[detail.status] ?? "default"}>{detail.status.replace(/_/g, " ")}</Badge>
                  <Badge variant={PRIORITY_BADGE[detail.priority] ?? "default"}>{detail.priority}</Badge>
                  {detail.slaBreachedAt && <Badge variant="danger">SLA breached</Badge>}
                  {!closed && (
                    <span className="flex items-center gap-1 text-xs text-ink-500">
                      <Clock className="h-3 w-3" />
                      Due {new Date(detail.slaDueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  )}
                  {detail.reopenCount > 0 && (
                    <span className="text-xs text-ink-500">Reopened ×{detail.reopenCount}</span>
                  )}
                </div>
                <h2 className="mt-2 font-display text-lg font-semibold text-ink-900">{detail.subject}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{detail.description}</p>
                <p className="mt-2 text-xs text-ink-500">
                  Raised by <strong>{detail.raisedBy?.name}</strong> ({detail.raisedBy?.role?.replace(/_/g, " ")},{" "}
                  {detail.raisedBy?.phone})
                  {detail.txnRefId && (
                    <>
                      {" "}· Transaction <span className="font-mono">{detail.txnRefId}</span>
                    </>
                  )}
                </p>
                {detail.resolution && (
                  <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Resolution {detail.resolvedByName && <>— by {detail.resolvedByName}</>}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{detail.resolution}</p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-5">
                <p className="text-sm font-semibold text-ink-900">Conversation</p>
                <ul className="mt-3 space-y-3">
                  {detail.messages.length === 0 && (
                    <li className="text-xs text-ink-500">No replies yet.</li>
                  )}
                  {detail.messages.map((m) => (
                    <li
                      key={m.id}
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                        m.fromSupport ? "ml-auto bg-brand-50 text-ink-800" : "bg-ink-100 text-ink-800"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                        {m.authorName} ·{" "}
                        {new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>

                <form onSubmit={sendReply} className="mt-4 flex gap-2">
                  <Input
                    placeholder="Reply as support…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <Button type="submit" disabled={busy === "reply" || !reply.trim()}>
                    <Send className="h-4 w-4" />
                    {busy === "reply" ? "Sending…" : "Send"}
                  </Button>
                </form>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-ink-100 bg-white p-5">
                <p className="text-sm font-semibold text-ink-900">Actions</p>
                {closed ? (
                  <p className="mt-2 text-xs text-ink-500">
                    Ticket is closed. A user reply will reopen it automatically.
                  </p>
                ) : (
                  <>
                    <textarea
                      rows={4}
                      className="mt-3 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                      placeholder="Resolution note (required to resolve/reject)…"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                    />
                    <div className="mt-3 grid gap-2">
                      <Button onClick={() => act("RESOLVE")} disabled={busy !== null}>
                        <CheckCircle2 className="h-4 w-4" />
                        {busy === "RESOLVE" ? "Resolving…" : "Resolve ticket"}
                      </Button>
                      <Button variant="outline" onClick={() => act("AWAIT_USER")} disabled={busy !== null}>
                        <PauseCircle className="h-4 w-4" />
                        {busy === "AWAIT_USER" ? "Updating…" : "Await user reply"}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => act("REJECT")}
                        disabled={busy !== null}
                      >
                        <XCircle className="h-4 w-4" />
                        {busy === "REJECT" ? "Closing…" : "Reject / close"}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4 text-xs text-ink-600">
                <p className="font-semibold text-ink-800">SLA policy</p>
                <p className="mt-1">Urgent 4h · High 24h · Normal 48h · Low 72h.</p>
                <p className="mt-1">
                  Breaches escalate priority one level and alert ops. &quot;Await user reply&quot; pauses the clock; it
                  restarts when the user responds.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
