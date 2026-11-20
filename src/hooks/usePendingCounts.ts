"use client";

import useSWR from "swr";

export type PendingCounts = {
  qrClaims: number;
  posBookings: number;
  posSlips: number;
};

const fetcher = async (url: string): Promise<PendingCounts> => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Failed to load pending counts");
  return data;
};

/**
 * Polls the admin pending-counts endpoint every 30 seconds. Only fires when
 * `enabled` is true (i.e. the viewer is a staff role that sees admin tabs).
 *
 * Returns a map of { qrClaims, posBookings, posSlips } or undefined while
 * loading / for non-staff users. The sidebar uses this to render live numeric
 * badges on the three admin review-queue tabs.
 */
export function usePendingCounts(enabled: boolean): PendingCounts | undefined {
  const { data } = useSWR(
    enabled ? "/api/admin/pending-counts" : null,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    },
  );
  return data;
}
