"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { X, ChevronsLeft, ChevronsRight, ChevronDown } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";
import { toDisplayRole, type Role } from "@/lib/auth";
import { navByRole, type NavGroup, type NavItem } from "@/lib/roles";
import { hrefToServiceKey } from "@/lib/services/catalog";
import { useEffectiveServices } from "@/hooks/useEffectiveServices";

/** Recursively filter nav items by a predicate applied to leaf links. Parent
 *  items (with children) are kept only if at least one child survives, so a
 *  collapsible tab disappears entirely once all of its sub-links are hidden. */
function filterNavItems(items: NavItem[], keep: (item: NavItem) => boolean): NavItem[] {
  return items
    .map((item) => {
      if (item.children && item.children.length > 0) {
        const children = filterNavItems(item.children, keep);
        return children.length > 0 ? { ...item, children } : null;
      }
      return keep(item) ? item : null;
    })
    .filter((x): x is NavItem => x !== null);
}

export function Sidebar({
  open,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const role: Role = useMemo(() => {
    if (!session?.user?.role) return "retailer";
    return toDisplayRole(session.user.role as any);
  }, [session]);

  const allowedTabs: string[] = useMemo(
    () => (session?.user as any)?.allowedTabs ?? [],
    [session]
  );

  const isStaff =
    role === "master-admin" || role === "admin" || role === "sub-admin" || role === "finance";

  // Effective services (globally enabled AND enabled per-user). Null while
  // loading — service links stay hidden until the allowlist is known.
  const effectiveServices = useEffectiveServices();

  const groups: NavGroup[] = useMemo(() => {
    let base = navByRole[role];

    // Admin/sub-admin: filter workspace tabs by allowedTabs. Tab links may sit
    // under /dashboard/admin/, /dashboard/master-admin/ or /dashboard/sub-admin/
    // depending on the nav — match by slug regardless of prefix.
    // Master-admins always have full access and are never scoped.
    if ((role === "admin" || role === "sub-admin") && allowedTabs.length > 0) {
      const prefixes = [
        "/dashboard/admin/",
        "/dashboard/master-admin/",
        "/dashboard/sub-admin/",
      ];
      const matchTab = (item: NavItem) => {
        const prefix = prefixes.find((p) => item.href.startsWith(p));
        if (!prefix) return true;
        const slug = item.href.slice(prefix.length).split("/")[0];
        return allowedTabs.includes(slug);
      };
      base = base
        .map((group) => ({ ...group, items: filterNavItems(group.items, matchTab) }))
        .filter((group) => group.items.length > 0);
    }

    // Network roles (RT/DT/MD/SD): show only services that are enabled both
    // globally and for this user (default-disabled allowlist).
    if (!isStaff) {
      const allowed = effectiveServices ?? new Set<string>();
      const matchService = (item: NavItem) => {
        const key = hrefToServiceKey(item.href);
        if (!key) return true;
        return allowed.has(key);
      };
      base = base
        .map((group) => ({ ...group, items: filterNavItems(group.items, matchService) }))
        .filter((group) => group.items.length > 0);
    }

    return base;
  }, [role, allowedTabs, isStaff, effectiveServices]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-ink-100 bg-white transition-all duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[72px]" : "lg:w-72",
          "w-72"
        )}
      >
        <div className={cn(
          "flex h-16 items-center border-b border-ink-100 md:h-20",
          collapsed ? "justify-center px-2" : "justify-between px-5"
        )}>
          {!collapsed && <Logo />}
          {collapsed && (
            <div className="hidden lg:flex h-9 w-9 items-center justify-center">
              <Logo iconOnly />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto py-5", collapsed ? "px-2" : "px-3")}>
          {groups.map((group) => (
            <div key={group.heading} className="mb-5 last:mb-0">
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  {group.heading}
                </p>
              )}
              {collapsed && <div className="mb-2 mx-auto h-px w-8 bg-ink-100" />}
              <ul className="space-y-1">
                {group.items.map((item) =>
                  item.children && item.children.length > 0 ? (
                    <CollapsibleNavItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      onClose={onClose}
                    />
                  ) : (
                    <NavLeaf
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      onClose={onClose}
                    />
                  )
                )}
              </ul>
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="m-3 rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-accent-500 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
              NextGenPay Pro
            </p>
            <p className="mt-1 text-sm font-medium">
              {role === "retailer"
                ? "Become a distributor and earn commission overrides on every retailer."
                : role === "distributor"
                ? "Unlock white-label & API access — upgrade to Master Distributor."
                : role === "master-distributor"
                ? "Need help scaling? Talk to our enterprise team."
                : "All systems nominal · 99.97% uptime this month."}
            </p>
            <button className="mt-3 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white hover:text-brand-700">
              {role === "master-admin" || role === "admin" || role === "sub-admin" ? "View status page" : "Upgrade plan"}
            </button>
          </div>
        )}

        {/* Collapse/Expand toggle — desktop only */}
        <div className={cn("hidden lg:flex border-t border-ink-100", collapsed ? "justify-center p-2" : "justify-end px-3 py-2")}>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-700 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}

function isItemActive(item: NavItem, pathname: string): boolean {
  return (
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href))
  );
}

/** A single leaf link row in the sidebar. */
function NavLeaf({
  item,
  pathname,
  collapsed,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onClose: () => void;
}) {
  const Icon = item.icon;
  const active = isItemActive(item, pathname);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
          active
            ? "bg-brand-600 text-white shadow-soft"
            : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
          !collapsed && !active && "hover:translate-x-0.5"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-white" : "text-ink-500 group-hover:text-ink-700"
          )}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && item.badge && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold",
              active ? "bg-white/20 text-white" : "bg-accent-100 text-accent-700"
            )}
          >
            {item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

/** A collapsible parent tab whose children are individual leaf links. When the
 *  sidebar is collapsed to icons, children are flattened to individual icon
 *  rows so every service stays reachable with a single click. */
function CollapsibleNavItem({
  item,
  pathname,
  collapsed,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onClose: () => void;
}) {
  const children = item.children ?? [];
  const childActive = children.some((c) => isItemActive(c, pathname));
  const [open, setOpen] = useState(childActive);

  // Auto-expand when navigating into one of the children.
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  const Icon = item.icon;

  if (collapsed) {
    return (
      <>
        {children.map((child) => (
          <NavLeaf
            key={child.href}
            item={child}
            pathname={pathname}
            collapsed={collapsed}
            onClose={onClose}
          />
        ))}
      </>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          childActive
            ? "text-brand-700 hover:bg-ink-100"
            : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
          !childActive && "hover:translate-x-0.5"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            childActive ? "text-brand-600" : "text-ink-500 group-hover:text-ink-700"
          )}
        />
        <span className="truncate">{item.label}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-1 border-l border-ink-100 pl-2">
          {children.map((child) => (
            <NavLeaf
              key={child.href}
              item={child}
              pathname={pathname}
              collapsed={collapsed}
              onClose={onClose}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
