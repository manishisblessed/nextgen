import { notFound } from "next/navigation";
import { ReportView } from "@/components/dashboard/reports/ReportView";
import { isReportType } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

export default function ReportPage({ params }: { params: { type: string } }) {
  if (!isReportType(params.type)) notFound();
  return <ReportView type={params.type} />;
}
