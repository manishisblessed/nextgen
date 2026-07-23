"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Bell, Menu, Search, Wallet, LogOut } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { formatINR } from "@/lib/utils";
import { toDisplayRole } from "@/lib/auth";

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);

  const lastFetchedAt = useRef(0);

  const fetchBalance = useCallback(async (force = false) => {
    // Background tabs skip polling entirely; focus refetches are throttled so
    // rapid alt-tabbing doesn't hammer the API.
    if (!force && document.hidden) return;
    if (Date.now() - lastFetchedAt.current < 15_000) return;
    lastFetchedAt.current = Date.now();
    try {
      const res = await fetch("/api/wallet?balanceOnly=1");
      if (res.ok) {
        const data = await res.json();
        setLiveBalance(data.balance ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchBalance(true);
    const interval = setInterval(() => fetchBalance(), 60_000);
    const onFocus = () => fetchBalance();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchBalance]);

  async function logout() {
    await signOut({ redirect: false });
    router.push("/login");
  }

  const user = session?.user;
  const userCode = (user as { userCode?: string | null } | undefined)?.userCode ?? null;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
    : "??";

  const displayRole = user?.role ? toDisplayRole(user.role as any) : "agent";

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
              {formatINR(liveBalance ?? user?.walletBalance ?? 0)}
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
                {user?.name ?? "Guest"}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-ink-500">
                {displayRole}{userCode ? ` · ${userCode}` : ""}
              </span>
            </span>
          </button>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
              <div className="border-b border-ink-100 p-3 text-sm">
                <p className="font-semibold text-ink-900">
                  {user?.name}
                  {userCode && (
                    <span className="ml-2 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 align-middle">
                      {userCode}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-500">{user?.email}</p>
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
