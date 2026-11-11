import { CreditCard } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { ChagansCCBillForm } from "@/components/dashboard/ChagansCCBillForm";

export const dynamic = "force-dynamic";

export default function OfflineCCPayPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={CreditCard}
        title="Offline CC Bill Payment"
        description="Pay credit card bills directly — select your card issuer, enter your consumer details, fetch the bill, and pay securely from your wallet."
      />
      <ChagansCCBillForm />
    </div>
  );
}
