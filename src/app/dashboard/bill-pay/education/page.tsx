import { GraduationCap } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BbpsBillForm } from "@/components/dashboard/BbpsBillForm";

export const dynamic = "force-dynamic";

export default function EducationFeesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={GraduationCap}
        title="Education Fees"
        description="Pay school, college and coaching fees with auto reminders."
      />
      <BbpsBillForm
        category="EDUCATION"
        serviceTitle="Education"
        consumerLabel="Student / Roll #"
        refPrefix="EDU"
      />
    </div>
  );
}
