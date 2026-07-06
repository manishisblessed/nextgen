import { Droplets } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BbpsBillForm } from "@/components/dashboard/BbpsBillForm";

export const dynamic = "force-dynamic";

export default function WaterBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Droplets}
        title="Water Bill Payment"
        description="Pay municipal water bills across major cities in India."
      />
      <BbpsBillForm
        category="WATER"
        serviceTitle="Water"
        consumerLabel="K-number / Connection #"
        refPrefix="WATR"
      />
    </div>
  );
}
