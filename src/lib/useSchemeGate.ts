"use client";

import useSWR from "swr";

type SchemeStatus = {
  applicable: boolean;
  hasScheme: boolean;
  hasMdrScheme: boolean;
  schemeName: string | null;
  mdrSchemeName: string | null;
  role: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Shared hook for the scheme gate. Network users (RT/DT/MD/SD) without an
 * active scheme cannot transact — this hook exposes that status so both the
 * banner and individual service pages can react.
 */
export function useSchemeGate() {
  const { data, isLoading } = useSWR<SchemeStatus>("/api/me/scheme-status", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const blocked = !!data?.applicable && !data.hasScheme;

  return {
    /** true while the status is still loading from the API. */
    isLoading,
    /** true when the scheme gate applies to this user AND they have no active scheme. */
    blocked,
    /** The role label of who should assign the scheme (e.g. "distributor"). */
    role: data?.role ?? null,
    /** The raw status data from the API. */
    data: data ?? null,
  };
}
