"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Menu, Search, Wallet, LogOut } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { clearSession, getSession, type Session } from "@/lib/auth";
import { formatINR } from "@/lib/utils";

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSession(getSession());
  }, []);

  function logout() {
    clearSession();
    router.push("/login");
  }

  const initials = session?.name
    ? session.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
    : "AA";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-ink-100 bg-white/80 px-4 backdrop-blur md:h-20 md:px-8">
      <div className="flex items-center gap-3 lg:hidden">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 text-ink-700"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="hidden flex-1 max-w-md md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search services, customers, transactions..." className="pl-9" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-2xl border border-ink-100 bg-gradient-to-r from-brand-50 to-accent-50 px-4 py-2 md:flex">
          <Wallet className="h-4 w-4 text-brand-700" />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
              Wallet
            </span>
            <span className="font-display text-sm font-bold text-ink-900">
              {formatINR(session?.walletBalance ?? 0)}
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 text-ink-700 hover:bg-ink-50"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white px-2 py-1.5 pr-3 hover:border-ink-200"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-display text-xs font-bold text-white">
              {initials}
            </span>
            <span className="hidden flex-col text-left leading-tight md:flex">
              <span className="text-sm font-semibold text-ink-900">
                {session?.name ?? "Guest"}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-ink-500">
                {session?.role ?? "agent"}
              </span>
            </span>
          </button>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
              <div className="border-b border-ink-100 p-3 text-sm">
                <p className="font-semibold text-ink-900">{session?.name}</p>
                <p className="text-xs text-ink-500">{session?.email}</p>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
