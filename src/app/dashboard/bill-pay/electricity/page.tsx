import { Lightbulb } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BillForm } from "@/components/dashboard/BillForm";

export const dynamic = "force-dynamic";

export default function ElectricityBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Lightbulb}
        title="Electricity Bill Payment"
        description="Pay state and private electricity bills across India — BBPS-integrated for instant confirmation."
      />
      <BillForm
        serviceTitle="Electricity"
        consumerLabel="Consumer number"
        billers={[
          "BSES Rajdhani",
          "BSES Yamuna",
          "Tata Power Delhi",
          "Adani Electricity Mumbai",
          "MSEB Maharashtra",
          "BESCOM Karnataka",
          "TNEB Tamil Nadu",
          "PSPCL Punjab",
          "UPPCL Uttar Pradesh"
        ]}
        refPrefix="ELEC"
      />
    </div>
  );
}
