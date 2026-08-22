import { notFound } from "next/navigation";
import { ReportView } from "@/components/dashboard/reports/ReportView";
import { isReportType } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

export default async function ReportPage(props: { params: Promise<{ type: string }> }) {
  const params = await props.params;
  if (!isReportType(params.type)) notFound();
  return <ReportView type={params.type} />;
}
