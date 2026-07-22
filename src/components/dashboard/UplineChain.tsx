export type UplineChainNode = {
  role: string;
  name: string;
  userCode?: string | null;
};

const ROLE_ABBR: Record<string, string> = {
  RETAILER: "RT",
  DISTRIBUTOR: "DT",
  MASTER_DISTRIBUTOR: "MD",
  SUPER_DISTRIBUTOR: "SD",
};

const ROLE_TONE: Record<string, string> = {
  DISTRIBUTOR: "bg-brand-50 text-brand-700",
  MASTER_DISTRIBUTOR: "bg-violet-50 text-violet-700",
  SUPER_DISTRIBUTOR: "bg-amber-50 text-amber-700",
  RETAILER: "bg-ink-100 text-ink-700",
};

/**
 * Renders a user's upline as breadcrumb chips, nearest parent first
 * (e.g. DT · Kiran › MD · Suresh › SD · Ramesh). Falls back to an em-dash
 * when the user has no upline (e.g. a top-level Super Distributor).
 */
export function UplineChain({ nodes }: { nodes: UplineChainNode[] }) {
  if (!nodes || nodes.length === 0) {
    return <span className="text-ink-400">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {nodes.map((n, i) => (
        <span key={n.userCode ?? `${n.role}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-ink-300">›</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
              ROLE_TONE[n.role] ?? "bg-ink-100 text-ink-700"
            }`}
            title={n.userCode ? `${n.name} (${n.userCode})` : n.name}
          >
            <span className="font-bold">{ROLE_ABBR[n.role] ?? n.role}</span>
            <span className="max-w-[120px] truncate">{n.name}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
