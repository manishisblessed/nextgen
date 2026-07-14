import { ShieldCheck } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BbpsBillForm } from "@/components/dashboard/BbpsBillForm";

export const dynamic = "force-dynamic";

export default function InsuranceBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={ShieldCheck}
        title="Insurance Premium Payment"
        description="Pay life insurance premiums across major insurers via BBPS — instant confirmation."
      />
      <BbpsBillForm
        category="INSURANCE"
        serviceTitle="Insurance"
        consumerLabel="Policy number"
        refPrefix="INS"
      />
    </div>
  );
}
