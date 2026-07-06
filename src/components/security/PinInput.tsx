"use client";

import { useEffect, useRef } from "react";

/**
 * Segmented numeric PIN input — one box per digit, auto-advance, backspace
 * to previous, paste-aware, digits masked like a card terminal.
 */
export function PinInput({
  length = 4,
  value,
  onChange,
  onComplete,
  autoFocus = true,
  disabled = false,
  masked = true,
  id = "pin",
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  masked?: boolean;
  id?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const chars = value.split("");
    chars[i] = digit;
    const next = chars.join("").slice(0, length);
    commit(next);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Never let Enter bubble into an enclosing form (the dialog may be
      // rendered inside one); a complete PIN submits via onComplete instead.
      e.preventDefault();
      if (value.length === length) onComplete?.(value);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      const chars = value.split("");
      if (chars[i]) {
        chars[i] = "";
        commit(chars.join(""));
      } else if (i > 0) {
        chars[i - 1] = "";
        commit(chars.join(""));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    commit(pasted);
    const filled = Math.min(pasted.replace(/\D/g, "").length, length) - 1;
    if (filled >= 0) refs.current[Math.min(filled, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={i === 0 ? id : undefined}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`PIN digit ${i + 1}`}
          className="h-12 w-10 rounded-xl border border-ink-200 bg-white text-center font-display text-xl font-bold text-ink-900 caret-brand-600 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:bg-ink-50 disabled:text-ink-400 sm:h-14 sm:w-12"
        />
      ))}
    </div>
  );
}
