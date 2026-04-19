"use client";

import { useEffect, useState } from "react";
import { Eye, Download, FileText, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSession, type Session } from "@/lib/auth";
import {
  downloadCSV,
  downloadPDF,
  type ReportColumn,
  cellValue
} from "@/lib/reports";

type Props<T> = {
  /** Used as the file name + on-screen title for the report. */
  filename: string;
  /** Document title for the PDF + preview header. */
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
  /** Optional secondary line under the report title in PDF / preview. */
  subtitle?: string;
};

/**
 * Three-button toolbar — View, CSV, PDF — that any report-style page can
 * drop into its `<PageHeader actions>` slot.
 *
 * Access is implicit: a user can only see this component if they were
 * already allowed onto the page hosting it, so the data always reflects
 * the role-scoped rows the page chose to render.
 */
export function ReportActions<T>({
  filename,
  title,
  columns,
  rows,
  subtitle
}: Props<T>) {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const generatedFor = session
    ? `${session.name} (${session.role}${session.userCode ? " · " + session.userCode : ""})`
    : undefined;

  return (
    <>
      <Button
        variant="outline"
        size="md"
        onClick={() => setOpen(true)}
        title="Preview the report"
      >
        <Eye className="h-4 w-4" />
        View
      </Button>
      <Button
        variant="outline"
        size="md"
        onClick={() => downloadCSV(filename, rows, columns)}
        title="Download as CSV"
      >
        <FileSpreadsheet className="h-4 w-4" />
        CSV
      </Button>
      <Button
        size="md"
        onClick={() =>
          downloadPDF(title, rows, columns, { generatedFor, subtitle })
        }
        title="Open print-ready PDF"
      >
        <FileText className="h-4 w-4" />
        PDF
      </Button>

      {open && (
        <PreviewDialog
          title={title}
          subtitle={subtitle}
          generatedFor={generatedFor}
          columns={columns}
          rows={rows}
          onClose={() => setOpen(false)}
          onDownloadCsv={() => downloadCSV(filename, rows, columns)}
          onDownloadPdf={() =>
            downloadPDF(title, rows, columns, { generatedFor, subtitle })
          }
        />
      )}
    </>
  );
}

function PreviewDialog<T>({
  title,
  subtitle,
  generatedFor,
  columns,
  rows,
  onClose,
  onDownloadCsv,
  onDownloadPdf
}: {
  title: string;
  subtitle?: string;
  generatedFor?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  onClose: () => void;
  onDownloadCsv: () => void;
  onDownloadPdf: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 bg-gradient-to-br from-brand-50/50 to-white px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
              Report preview
            </p>
            <h3 className="mt-0.5 truncate font-display text-lg font-bold text-ink-900">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-ink-500">{subtitle}</p>
            )}
            <p className="mt-1 text-[11px] text-ink-500">
              {rows.length} record{rows.length === 1 ? "" : "s"}
              {generatedFor ? ` · for ${generatedFor}` : ""} ·{" "}
              {new Date().toLocaleString("en-IN")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-50/80 text-left text-xs uppercase tracking-wider text-ink-500 backdrop-blur">
              <tr>
                {columns.map((c) => (
                  <th
                    key={String(c.key)}
                    className="px-5 py-3 font-semibold"
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-800">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-5 py-12 text-center text-sm text-ink-500"
                  >
                    No records to preview.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={
                      ((row as { id?: string | number }).id as
                        | string
                        | number) ?? i
                    }
                    className="hover:bg-ink-50/40"
                  >
                    {columns.map((c) => (
                      <td key={String(c.key)} className="px-5 py-3">
                        {cellValue(c, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/40 px-6 py-3">
          <Button variant="outline" size="md" onClick={onDownloadCsv}>
            <FileSpreadsheet className="h-4 w-4" /> Download CSV
          </Button>
          <Button size="md" onClick={onDownloadPdf}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
