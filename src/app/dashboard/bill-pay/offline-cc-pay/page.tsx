import { CreditCard } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { RechargekitDirectCCForm } from "@/components/dashboard/RechargekitDirectCCForm";

export const dynamic = "force-dynamic";

export default function OfflineCCPayPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={CreditCard}
        title="Offline CC Bill Payment"
        description="Pay credit card bills directly via RechargeKit — enter the full card number, bank details, transfer type (IMPS/NEFT), and amount. Charges are shown before confirmation."
      />
      <RechargekitDirectCCForm />
    </div>
  );
}
