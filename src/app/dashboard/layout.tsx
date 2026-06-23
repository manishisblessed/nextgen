"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { TwoFactorSetupModal } from "@/components/dashboard/TwoFactorSetupModal";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession({ required: true });
  const [open, setOpen] = useState(false);

  const needs2FASetup = status === "authenticated" && !session?.user?.twoFactorEnabled;

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-50/50">
        <div className="flex items-center gap-3 text-ink-500">
          <span className="h-3 w-3 animate-pulse rounded-full bg-brand-500" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-ink-50/40">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSidebar={() => setOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-[1400px] min-w-0">
            {children}
          </div>
        </main>
      </div>

      {needs2FASetup && <TwoFactorSetupModal />}
    </div>
  );
}
