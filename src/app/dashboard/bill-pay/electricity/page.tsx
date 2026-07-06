import { Lightbulb } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BbpsBillForm } from "@/components/dashboard/BbpsBillForm";

export const dynamic = "force-dynamic";

export default function ElectricityBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Lightbulb}
        title="Electricity Bill Payment"
        description="Pay state and private electricity bills across India — BBPS-integrated for instant confirmation."
      />
      <BbpsBillForm
        category="ELECTRICITY"
        serviceTitle="Electricity"
        consumerLabel="Consumer number"
        refPrefix="ELEC"
      />
    </div>
  );
}
