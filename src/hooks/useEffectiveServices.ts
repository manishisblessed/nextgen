"use client";

import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Failed to load services");
  return data as { services?: string[] };
};

/**
 * Effective service keys for the signed-in user (globally enabled AND enabled
 * for this user by an admin). Returns `null` while loading so callers can
 * fail-closed (hide service entry points until the allowlist is known).
 * Shared SWR cache so Sidebar + overviews share one request.
 */
export function useEffectiveServices(): Set<string> | null {
  const { data, error, isLoading } = useSWR("/api/services/available", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });

  if (isLoading && !data) return null;
  if (error || !data) return new Set();
  return new Set<string>(data.services ?? []);
}
