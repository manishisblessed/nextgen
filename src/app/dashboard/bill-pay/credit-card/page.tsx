import { CreditCard } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { BillForm } from "@/components/dashboard/BillForm";

export default function CreditCardBillPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={CreditCard}
        title="Credit Card Bill Payment"
        description="Pay credit card bills across all major banks via NEFT / IMPS."
      />
      <BillForm
        serviceTitle="Credit Card"
        consumerLabel="Card number"
        billers={[
          "HDFC Credit Card",
          "ICICI Credit Card",
          "SBI Credit Card",
          "Axis Bank Card",
          "Kotak Credit Card",
          "RBL Credit Card",
          "AmEx",
          "IndusInd Card"
        ]}
        refPrefix="CC"
      />
    </div>
  );
}
