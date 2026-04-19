import { Smartphone } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { RechargeForm } from "@/components/dashboard/RechargeForm";

export default function MobileRechargePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Smartphone}
        title="Mobile Recharge"
        description="Recharge any prepaid mobile across India with instant confirmation and best cashback offers."
      />
      <RechargeForm
        serviceTitle="Mobile Recharge"
        numberLabel="Mobile number"
        numberPlaceholder="10-digit mobile"
        operators={["Jio", "Airtel", "Vi (Vodafone Idea)", "BSNL", "MTNL"]}
        refPrefix="MOB"
      />
    </div>
  );
}
