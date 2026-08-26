import { getSession } from "./auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.token) h["Authorization"] = `Bearer ${session.token}`;
  return h;
}

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...opts.headers };
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
  const json = await res.json();
  if (!res.ok) throw new ApiError(json.error ?? res.statusText, res.status);
  return json as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),

  // Auth (no token needed)
  login: (identifier: string, password: string) =>
    request<{
      ok: boolean;
      token: string;
      user: {
        id: string;
        name: string;
        email: string;
        phone: string;
        role: string;
        status: string;
        walletBalance: number;
      };
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
      headers: { "Content-Type": "application/json" },
    }),

  // Wallet
  getWallet: () =>
    request<{
      balance: number;
      monthlyIn: number;
      monthlyOut: number;
      recentTxns: Array<{
        id: string;
        direction: string;
        reason: string;
        amount: number;
        // Null for payout reservation memos — a hold/release never moves the balance.
        balanceAfter: number | null;
        note: string | null;
        createdAt: string;
        memo?: boolean;
      }>;
    }>("/api/wallet?memos=1"),

  // Service transaction feed (recharge / DMT / AEPS / UPI / BBPS …). The server
  // returns display-ready rows scoped to the signed-in user; `status` filtering
  // and search can be pushed down, but the screen also filters client-side.
  getTransactions: (opts?: { status?: string; q?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (opts?.status && opts.status !== "All") p.set("status", opts.status);
    if (opts?.q) p.set("q", opts.q);
    p.set("limit", String(opts?.limit ?? 200));
    return request<{
      ok: boolean;
      data: Array<{
        id: string;
        service: string;
        amount: number;
        status: "Success" | "Pending" | "Failed";
        date: string;
        customer: string;
        commission: number;
      }>;
    }>(`/api/transactions?${p.toString()}`);
  },
};
