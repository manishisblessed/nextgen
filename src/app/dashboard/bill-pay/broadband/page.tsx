import { Wifi } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BbpsBillForm } from "@/components/dashboard/BbpsBillForm";

export const dynamic = "force-dynamic";

export default function BroadbandBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Wifi}
        title="Broadband Bill Payment"
        description="Pay postpaid broadband and landline bills across major ISPs."
      />
      <BbpsBillForm
        category="BROADBAND"
        serviceTitle="Broadband"
        consumerLabel="Account / Customer ID"
        refPrefix="BB"
      />
    </div>
  );
}
