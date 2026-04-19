import { Droplets } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BillForm } from "@/components/dashboard/BillForm";

export default function WaterBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Droplets}
        title="Water Bill Payment"
        description="Pay municipal water bills across major cities in India."
      />
      <BillForm
        serviceTitle="Water"
        consumerLabel="K-number / Connection #"
        billers={[
          "Delhi Jal Board",
          "BMC Mumbai",
          "BWSSB Bengaluru",
          "Chennai Metro Water",
          "PHED Rajasthan",
          "Hyderabad Water Board"
        ]}
        refPrefix="WATR"
      />
    </div>
  );
}
