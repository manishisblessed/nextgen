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
        balanceAfter: number;
        note: string | null;
        createdAt: string;
      }>;
    }>("/api/wallet"),

  getTransactions: (page = 1) =>
    request<{
      transactions: Array<{
        id: string;
        refId: string;
        service: string;
        amount: number;
        fee: number;
        commission: number;
        status: string;
        customer: string | null;
        operator: string | null;
        createdAt: string;
      }>;
      total: number;
    }>(`/api/wallet/transactions?page=${page}&pageSize=20`),
};
