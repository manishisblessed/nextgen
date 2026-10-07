import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";

/**
 * Public payment-return landing (NO auth).
 *
 * Payment gateways (Chagans → Cashfree) redirect the customer here after
 * checkout, often via a cross-site POST. Returning straight to /dashboard/wallet
 * would hit the auth middleware without the SameSite cookie and bounce the user
 * to the login wall — confusing right after they paid. This page is public, so
 * the return always lands somewhere friendly.
 *
 * It never credits anything: Chagans is webhook-authoritative, so the wallet is
 * credited server-side once the (IP-authenticated) webhook arrives. The open
 * dashboard tab that started the top-up polls and updates on its own.
 */
export const dynamic = "force-dynamic";

export default async function PayReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; topup?: string }>;
}) {
  const sp = await searchParams;
  const ref = sp.ref || sp.topup || "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold text-ink-900">
          Payment received
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Thanks! We&apos;re confirming your payment with the bank. Your wallet
          is credited automatically once it&apos;s verified — this usually takes
          a few seconds. You can safely close this tab.
        </p>
        {ref && (
          <p className="mt-3 text-xs text-ink-400">
            Reference <span className="font-mono text-ink-600">{ref}</span>
          </p>
        )}
        <Link href="/dashboard/wallet" className="mt-6 block">
          <Button size="lg" className="w-full">
            Go to my wallet
          </Button>
        </Link>
        <p className="mt-3 text-[11px] text-ink-400">
          If the amount isn&apos;t reflected within a few minutes, contact
          support with the reference above — no amount is ever lost.
        </p>
      </div>
    </main>
  );
}
