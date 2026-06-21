"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { RefreshCw } from "lucide-react";

type ServiceRow = {
  service: string;
  live: boolean;
  provider: string;
};

export default function AdminSystemPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [dbStatus, setDbStatus] = useState("—");
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/healthz");
      const data = await res.json();
      setDbStatus(data.db ?? "unknown");
      if (data.partners) {
        setServices(
          Object.entries(data.partners as Record<string, { live: boolean; provider: string }>).map(
            ([key, val]) => ({ service: key.toUpperCase(), live: val.live, provider: val.provider })
          )
        );
      }
    } catch {
      setDbStatus("unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const cols: Column<ServiceRow>[] = [
    { key: "service", header: "Service", render: (r) => <span className="font-semibold text-ink-900">{r.service}</span> },
    { key: "provider", header: "Provider" },
    {
      key: "live",
      header: "Status",
      render: (r) => (
        <Badge variant={r.live ? "success" : "warning"}>
          {r.live ? "Live" : "Mock"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="System health"
        description="Live status of database, partner integrations, and all payment switches."
        actions={
          <Button variant="outline" onClick={fetchHealth} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="Database"
          status={dbStatus === "up" ? "Healthy" : "Down"}
          variant={dbStatus === "up" ? "success" : "danger"}
        />
        <StatusCard
          title="Live Partners"
          status={`${services.filter((s) => s.live).length} of ${services.length}`}
          variant={services.some((s) => s.live) ? "success" : "warning"}
        />
        <StatusCard
          title="Mock Partners"
          status={`${services.filter((s) => !s.live).length}`}
          variant="default"
        />
      </div>

      <DataTable
        title={loading ? "Loading..." : "Partner integrations"}
        columns={cols}
        data={services}
      />
    </div>
  );
}

function StatusCard({ title, status, variant }: { title: string; status: string; variant: string }) {
  const colors: Record<string, string> = {
    success: "border-emerald-200 bg-emerald-50",
    danger: "border-rose-200 bg-rose-50",
    warning: "border-amber-200 bg-amber-50",
    default: "border-ink-100 bg-white",
  };
  const textColors: Record<string, string> = {
    success: "text-emerald-700",
    danger: "text-rose-700",
    warning: "text-amber-700",
    default: "text-ink-700",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[variant] ?? colors.default}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-ink-500">{title}</p>
      <p className={`mt-1 font-display text-xl font-bold ${textColors[variant] ?? textColors.default}`}>
        {status}
      </p>
    </div>
  );
}
