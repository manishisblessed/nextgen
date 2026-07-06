import { Flame } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BbpsBillForm } from "@/components/dashboard/BbpsBillForm";

export const dynamic = "force-dynamic";

export default function GasBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Flame}
        title="Gas Bill Payment"
        description="Pay piped gas bills or book LPG cylinder refills for any major operator."
      />
      <BbpsBillForm
        category="GAS"
        serviceTitle="Gas"
        consumerLabel="Consumer / Booking #"
        refPrefix="GAS"
      />
    </div>
  );
}
