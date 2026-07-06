import { Wifi } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { RechargeForm } from "@/components/dashboard/RechargeForm";

export const dynamic = "force-dynamic";

export default function BroadbandPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Wifi}
        title="Broadband / OTT"
        description="Pay your postpaid broadband, landline & OTT subscription bills."
      />
      <RechargeForm
        serviceTitle="Broadband / OTT"
        type="BROADBAND"
        numberLabel="Account / customer ID"
        numberPlaceholder="Enter account number"
        operators={["JioFiber", "Airtel Xstream", "BSNL", "ACT Fibernet", "Hathway", "Netflix", "Hotstar"]}
        amountPresets={[499, 799, 1099, 1499, 1999]}
        refPrefix="BB"
      />
    </div>
  );
}
