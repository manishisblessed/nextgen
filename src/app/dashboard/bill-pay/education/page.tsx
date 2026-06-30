import { GraduationCap } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BillForm } from "@/components/dashboard/BillForm";

export const dynamic = "force-dynamic";

export default function EducationFeesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={GraduationCap}
        title="Education Fees"
        description="Pay school, college and coaching fees with auto reminders."
      />
      <BillForm
        serviceTitle="Education"
        consumerLabel="Student / Roll #"
        billers={[
          "DPS Schools",
          "Kendriya Vidyalaya",
          "Delhi University",
          "JEE Main",
          "BYJU'S",
          "Allen Career Institute",
          "FIITJEE"
        ]}
        refPrefix="EDU"
      />
    </div>
  );
}
