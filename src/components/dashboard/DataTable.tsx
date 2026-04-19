"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type Column<T> = {
  key: keyof T | string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  render?: (row: T) => ReactNode;
};

export function DataTable<T>({
  title,
  description,
  columns,
  data,
  action,
  empty = "No records to show."
}: {
  title?: string;
  description?: string;
  columns: Column<T>[];
  data: T[];
  action?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            {title && (
              <h3 className="font-display text-base font-semibold text-ink-900">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-ink-500">{description}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={cn(
                    "px-5 py-3 font-semibold",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center"
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-800">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-10 text-center text-sm text-ink-500"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={(row as { id?: string | number }).id ?? i}
                  className="hover:bg-ink-50/40"
                >
                  {columns.map((c) => (
                    <td
                      key={String(c.key)}
                      className={cn(
                        "px-5 py-3",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        c.className
                      )}
                    >
                      {c.render
                        ? c.render(row)
                        : ((row as Record<string, unknown>)[
                            String(c.key)
                          ] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
