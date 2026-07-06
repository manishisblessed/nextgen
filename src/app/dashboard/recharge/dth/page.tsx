import { Tv } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { RechargeForm } from "@/components/dashboard/RechargeForm";

export const dynamic = "force-dynamic";

export default function DthRechargePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Tv}
        title="DTH Recharge"
        description="Top up Tata Play, Dish TV, d2h, Sun Direct & Airtel Digital TV in seconds."
      />
      <RechargeForm
        serviceTitle="DTH Recharge"
        type="DTH"
        numberLabel="Subscriber / VC number"
        numberPlaceholder="Enter customer ID"
        operators={["Tata Play", "Dish TV", "d2h", "Sun Direct", "Airtel Digital TV"]}
        amountPresets={[200, 350, 449, 599, 999]}
        refPrefix="DTH"
      />
    </div>
  );
}
