"use client";

import { useEffect, useState } from "react";

/**
 * Effective service keys for the signed-in user (globally enabled AND enabled
 * for this user by an admin). Returns `null` while loading so callers can
 * fail-closed (hide service entry points until the allowlist is known).
 */
export function useEffectiveServices(): Set<string> | null {
  const [keys, setKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/services/available");
        const data = await res.json();
        if (!cancelled && res.ok) {
          setKeys(new Set<string>(data.services ?? []));
        } else if (!cancelled) {
          setKeys(new Set());
        }
      } catch {
        if (!cancelled) setKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return keys;
}
