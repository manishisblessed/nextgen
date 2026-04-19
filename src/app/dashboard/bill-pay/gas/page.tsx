import { Flame } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BillForm } from "@/components/dashboard/BillForm";

export default function GasBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Flame}
        title="Gas Bill Payment"
        description="Pay piped gas bills or book LPG cylinder refills for any major operator."
      />
      <BillForm
        serviceTitle="Gas"
        consumerLabel="Consumer / Booking #"
        billers={[
          "Indane (IOCL)",
          "HP Gas",
          "Bharat Gas",
          "Indraprastha Gas (IGL)",
          "Mahanagar Gas (MGL)",
          "Adani Gas"
        ]}
        refPrefix="GAS"
      />
    </div>
  );
}
