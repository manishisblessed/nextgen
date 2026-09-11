"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bell, Menu, Search, Wallet, LogOut, Activity, Landmark, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { formatINR } from "@/lib/utils";
import { toDisplayRole } from "@/lib/auth";

type NotifItem = { id: string; title: string; body: string; href: string | null; read: boolean; createdAt: string };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function Topbar({ onOpenSidebar, collapsed, onToggleCollapse }: { onOpenSidebar: () => void; collapsed?: boolean; onToggleCollapse?: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [payinToday, setPayinToday] = useState<number | null>(null);
  const [revenueBalance, setRevenueBalance] = useState<number | null>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const lastFetchedAt = useRef(0);

  const fetchNotifs = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const d = await res.json();
      setNotifs(Array.isArray(d.notifications) ? d.notifications : []);
      setUnread(typeof d.unread === "number" ? d.unread : 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30_000);
    const onFocus = () => fetchNotifs();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchNotifs]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  const onClickNotif = useCallback(async (n: NotifItem) => {
    setNotifOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: n.id }),
        });
      } catch {}
    }
    if (n.href) router.push(n.href);
  }, [router]);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    setNotifs((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {}
  }, []);

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
    // Only poll the personal wallet for users who actually see the Wallet pill.
    // Master admin + admin staff (ADMIN/SUPPORT/FINANCE) don't display it.
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role === "MASTER_ADMIN" || role === "ADMIN" || role === "SUPPORT" || role === "FINANCE") return;
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
  }, [fetchBalance, session]);

  // Live company PAYIN (today) — master-admin only. Read straight from the rail
  // sources so it mirrors the operational feeds and resets to ₹0 at IST midnight.
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const isMaster = sessionRole === "MASTER_ADMIN";
  // Admin staff (non-master) don't hold a personal/operational wallet, so hide the
  // generic Wallet pill for them. Payin + Revenue wallets stay master-admin only.
  const isAdminStaff = sessionRole === "ADMIN" || sessionRole === "SUPPORT" || sessionRole === "FINANCE";
  useEffect(() => {
    if (!isMaster) return;
    let active = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const [payinRes, revenueRes] = await Promise.all([
          fetch("/api/admin/wallet/aggregates?view=payin-today"),
          fetch("/api/admin/wallet/aggregates?view=revenue"),
        ]);
        if (!active) return;
        if (payinRes.ok) {
          const data = await payinRes.json();
          setPayinToday(typeof data.totalAmount === "number" ? data.totalAmount : null);
        }
        if (revenueRes.ok) {
          const data = await revenueRes.json();
          setRevenueBalance(typeof data.balance === "number" ? data.balance : null);
        }
      } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [isMaster]);

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

      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-700 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
        </button>
      )}

      <div className="hidden flex-1 max-w-md md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search services, customers, transactions..." className="pl-9" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isMaster && (
          <Link
            href="/dashboard/admin/wallet-ops?tab=payin"
            className="hidden items-center gap-2 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 transition-colors hover:border-emerald-300 md:flex"
            title="Live company payin today (all rails) — resets to ₹0 at midnight. Opens Wallet Operations → Live payin."
          >
            <Activity className="h-4 w-4 text-emerald-700" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700/80">
                Payin · Today
              </span>
              <span className="font-display text-sm font-bold text-ink-900">
                {formatINR(payinToday ?? 0)}
              </span>
            </div>
          </Link>
        )}

        {isMaster ? (
          <Link
            href="/dashboard/admin/revenue"
            className="hidden items-center gap-2 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-2 transition-colors hover:border-violet-300 md:flex"
            title="Revenue Wallet — company earnings (MDR margin in − commission out). Opens Company Earnings."
          >
            <Landmark className="h-4 w-4 text-violet-700" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-700/80">
                Revenue Wallet
              </span>
              <span className="font-display text-sm font-bold text-ink-900">
                {formatINR(revenueBalance ?? 0)}
              </span>
            </div>
          </Link>
        ) : isAdminStaff ? null : (
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
        )}

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => { setNotifOpen((o) => !o); if (!notifOpen) fetchNotifs(); }}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 text-ink-700 hover:bg-ink-50"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <p className="text-sm font-semibold text-ink-900">Notifications</p>
                {unread > 0 && (
                  <button type="button" onClick={markAllRead} className="text-xs font-semibold text-brand-600 hover:text-brand-800">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-ink-400">
                    <Bell className="mx-auto mb-2 h-6 w-6 text-ink-300" />
                    You&apos;re all caught up.
                  </div>
                ) : (
                  notifs.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => onClickNotif(n)}
                      className={`flex w-full items-start gap-2.5 border-b border-ink-50 px-4 py-3 text-left transition last:border-0 hover:bg-ink-50 ${n.read ? "" : "bg-brand-50/40"}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-500"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${n.read ? "font-medium text-ink-700" : "font-semibold text-ink-900"}`}>{n.title}</span>
                          <span className="shrink-0 text-[10px] text-ink-400">{timeAgo(n.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500">{n.body}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
