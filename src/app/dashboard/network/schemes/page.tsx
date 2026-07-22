"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";

/**
 * Network Schemes page has been deprecated. Schemes are now assigned by admin only.
 * Redirects to the dashboard after a brief message.
 */
export default function NetworkSchemesDeprecated() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/dashboard"), 3000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notice"
        title="Scheme Management Moved"
        description="Schemes are now managed and assigned by admin only. You will be redirected to your dashboard."
      />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm text-amber-800">
          The network scheme workspace has been removed. Your scheme is assigned directly by admin.
          Contact your admin if you need scheme changes.
        </p>
      </div>
    </div>
  );
}
