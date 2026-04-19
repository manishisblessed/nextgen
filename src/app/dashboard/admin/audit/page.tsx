"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { auditEvents, type AuditEvent } from "@/lib/data";
import { Search, Filter } from "lucide-react";

export default function AdminAuditPage() {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<"all" | AuditEvent["severity"]>("all");

  const rows = useMemo(
    () =>
      auditEvents.filter((e) => {
        if (sev !== "all" && e.severity !== sev) return false;
        if (!q) return true;
        const t = q.toLowerCase();
        return (
          e.actor.toLowerCase().includes(t) ||
          e.action.toLowerCase().includes(t) ||
          e.target.toLowerCase().includes(t) ||
          e.id.toLowerCase().includes(t)
        );
      }),
    [q, sev]
  );

  const cols: Column<AuditEvent>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "actor", header: "Actor" },
    { key: "action", header: "Action", render: (r) => <span className="font-semibold text-ink-900">{r.action}</span> },
    { key: "target", header: "Target" },
    { key: "ip", header: "IP", render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
    {
      key: "severity",
      header: "Severity",
      render: (r) => (
        <Badge variant={r.severity === "info" ? "brand" : r.severity === "warn" ? "warning" : "danger"}>
          {r.severity}
        </Badge>
      )
    },
    { key: "ts", header: "When", className: "whitespace-nowrap text-xs text-ink-500" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Immutable record of every privileged action across the platform. Exported daily to S3 + WORM storage."
      />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, action, target..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <Select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)} className="h-10 w-44">
            <option value="all">All severities</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="danger">Danger</option>
          </Select>
        </div>
      </div>

      <DataTable title={`${rows.length} events`} columns={cols} data={rows} />
    </div>
  );
}
