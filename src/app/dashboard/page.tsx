"use client";

import { useSession } from "next-auth/react";
import { toDisplayRole } from "@/lib/auth";
import { RetailerOverview } from "@/components/dashboard/overview/RetailerOverview";
import { DistributorOverview } from "@/components/dashboard/overview/DistributorOverview";
import { MasterOverview } from "@/components/dashboard/overview/MasterOverview";
import { AdminOverview } from "@/components/dashboard/overview/AdminOverview";

export default function DashboardHomePage() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const displayRole = toDisplayRole(session.user.role as any);

  const legacySession = {
    name: session.user.name,
    email: session.user.email,
    phone: session.user.phone,
    role: displayRole,
    walletBalance: session.user.walletBalance ?? 0,
    loggedInAt: Date.now(),
  };

  switch (displayRole) {
    case "master-admin":
    case "admin":
    case "sub-admin":
    case "finance":
      return <AdminOverview session={legacySession as any} />;
    case "super-distributor":
    case "master-distributor":
      return <MasterOverview session={legacySession as any} />;
    case "distributor":
      return <DistributorOverview session={legacySession as any} />;
    case "retailer":
    default:
      return <RetailerOverview session={legacySession as any} />;
  }
}
