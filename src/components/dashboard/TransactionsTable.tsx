import { Badge } from "@/components/ui/Badge";
import { recentTransactions, type Transaction } from "@/lib/data";
import { formatINR } from "@/lib/utils";

const statusVariant: Record<
  Transaction["status"],
  "success" | "warning" | "danger"
> = {
  Success: "success",
  Pending: "warning",
  Failed: "danger"
};

export function TransactionsTable({
  data = recentTransactions,
  showHeader = true
}: {
  data?: Transaction[];
  showHeader?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      {showHeader && (
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">
              Recent transactions
            </h3>
            <p className="text-xs text-ink-500">
              Showing latest {data.length} entries
            </p>
          </div>
          <button className="text-xs font-semibold text-brand-700 hover:underline">
            View all
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Txn ID</th>
              <th className="px-5 py-3 font-semibold">Service</th>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold text-right">Amount</th>
              <th className="px-5 py-3 font-semibold text-right">Commission</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-800">
            {data.map((t) => (
              <tr key={t.id} className="hover:bg-ink-50/40">
                <td className="px-5 py-3 font-mono text-xs">{t.id}</td>
                <td className="px-5 py-3">{t.service}</td>
                <td className="px-5 py-3 text-ink-600">{t.customer}</td>
                <td className="px-5 py-3 text-right font-semibold">
                  {formatINR(t.amount)}
                </td>
                <td className="px-5 py-3 text-right text-emerald-700">
                  +{formatINR(t.commission)}
                </td>
                <td className="px-5 py-3">
                  <Badge variant={statusVariant[t.status]}>{t.status}</Badge>
                </td>
                <td className="px-5 py-3 text-xs text-ink-500">{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
