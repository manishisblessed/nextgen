"use client";

import { useEffect, useState } from "react";
import { getSession, type Session } from "@/lib/auth";
import { RetailerOverview } from "@/components/dashboard/overview/RetailerOverview";
import { DistributorOverview } from "@/components/dashboard/overview/DistributorOverview";
import { MasterOverview } from "@/components/dashboard/overview/MasterOverview";
import { AdminOverview } from "@/components/dashboard/overview/AdminOverview";

export default function DashboardHomePage() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  if (!session) return null;

  switch (session.role) {
    case "admin":
      return <AdminOverview session={session} />;
    case "master-distributor":
      return <MasterOverview session={session} />;
    case "distributor":
      return <DistributorOverview session={session} />;
    case "retailer":
    default:
      return <RetailerOverview session={session} />;
  }
}
