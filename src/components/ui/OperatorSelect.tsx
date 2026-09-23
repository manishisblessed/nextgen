"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Search } from "lucide-react";
import { BankLogo } from "@/components/dashboard/BankLogo";
import { cn } from "@/lib/utils";

export type OperatorOption = {
  /** Stable value/code stored in form state (unchanged from the API). */
  value: string;
  /** Display name from the API — used verbatim and for logo resolution. */
  label: string;
};

/**
 * Accessible, searchable issuer/operator picker that shows each option's real
 * bank logo (via `BankLogo`) alongside its name — a drop-in visual upgrade over
 * a native <select>, whose <option> elements cannot render images.
 *
 * Behaviour mirrors a native select: single selection, `value`/`onChange`
 * (value is the option's `value`), full-width + responsive, keyboard support
 * (Enter/Space/ArrowDown to open, Arrow keys to move, Enter to pick, Escape to
 * close), type-to-filter, and outside-click / blur to dismiss. It does not
 * touch the option data or the surrounding payment logic.
 */
export function OperatorSelect({
  id,
  value,
  onChange,
  options,
  disabled = false,
  loading = false,
  loadingText = "Loading operators…",
  placeholder = "Select operator",
  emptyText = "No operators found",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: OperatorOption[];
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Close on outside pointer / focus loss.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  // On open: focus the search box and highlight the current selection.
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      filtered.findIndex((o) => o.value === value)
    );
    setActiveIndex(idx);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the active option in view.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function pick(opt: OperatorOption) {
    onChange(opt.value);
    close();
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (disabled || loading) return;
    if (
      !open &&
      (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")
    ) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(filtered.length - 1);
    }
  }

  const buttonLabel = loading
    ? loadingText
    : selected?.label ?? placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled || loading}
        onClick={() => !disabled && !loading && setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-left text-sm text-ink-900 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100",
          (disabled || loading) && "cursor-not-allowed opacity-60"
        )}
      >
        {!loading && <BankLogo name={selected?.label} size={30} />}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !selected && "text-ink-400"
          )}
        >
          {buttonLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-ink-100 px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onListKeyDown}
              placeholder="Search bank…"
              className="h-10 w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-activedescendant={
              filtered[activeIndex]
                ? `${listboxId}-${filtered[activeIndex].value}`
                : undefined
            }
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-ink-400">{emptyText}</li>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={opt.value}
                    id={`${listboxId}-${opt.value}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(opt)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
                      isActive ? "bg-brand-50" : "bg-white",
                      isSelected && "font-semibold text-brand-700"
                    )}
                  >
                    <BankLogo name={opt.label} size={36} />
                    <span className="min-w-0 flex-1 truncate text-ink-800">
                      {opt.label}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
