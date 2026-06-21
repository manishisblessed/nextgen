import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession as _getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { headers } from "next/headers";
import { prisma } from "./db";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  walletBalance: number;
  allowedTabs: string[];
};

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
  interface User extends SessionUser {}
}

declare module "next-auth/jwt" {
  interface JWT extends SessionUser {}
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        identifier: { label: "Email or Phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const identifier = credentials.identifier.trim().toLowerCase();

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { phone: identifier },
            ],
            deletedAt: null,
          },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        if (user.status === "CLOSED") return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          walletBalance: Number(user.walletBalance),
          allowedTabs: (user as any).allowedTabs ?? [],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.phone = user.phone;
        token.role = user.role;
        token.status = user.status;
        token.walletBalance = user.walletBalance;
        token.allowedTabs = (user as any).allowedTabs ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        name: token.name as string,
        email: token.email as string,
        phone: token.phone as string,
        role: token.role as string,
        status: token.status as string,
        walletBalance: token.walletBalance as number,
        allowedTabs: (token.allowedTabs as string[]) ?? [],
      };
      return session;
    },
  },
};

export async function getServerAuth() {
  return _getServerSession(authOptions);
}

// ---------------------------------------------------------------------------
// Mobile JWT helpers (HS256 — used by /api/auth/login for mobile clients)
// ---------------------------------------------------------------------------

function jwtSecret() {
  const s = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("[auth] JWT_SECRET or NEXTAUTH_SECRET must be set");
  return s;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function createMobileToken(user: SessionUser, expiresInSec = 30 * 24 * 60 * 60): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({
    sub: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    allowedTabs: user.allowedTabs,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  })));
  const signature = base64url(
    crypto.createHmac("sha256", jwtSecret()).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

export function verifyMobileToken(token: string): SessionUser | null {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const expected = base64url(
      crypto.createHmac("sha256", jwtSecret()).update(`${header}.${payload}`).digest()
    );
    if (signature !== expected) return null;

    const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
    const data = JSON.parse(Buffer.from(pad(payload.replace(/-/g, "+").replace(/_/g, "/")), "base64").toString());

    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      id: data.sub,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      status: data.status,
      walletBalance: 0,
      allowedTabs: data.allowedTabs ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Get authenticated user or throw. Checks NextAuth session first,
 * then falls back to Bearer token (for mobile/API clients).
 */
export async function requireAuth(): Promise<SessionUser> {
  // 1. Try NextAuth session (web)
  const session = await getServerAuth();
  if (session?.user) return session.user;

  // 2. Try Bearer token (mobile / API)
  const h = headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const user = verifyMobileToken(auth.slice(7));
    if (user) {
      // Refresh wallet balance from DB for accuracy
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { walletBalance: true, status: true },
      });
      if (dbUser) {
        user.walletBalance = Number(dbUser.walletBalance);
        user.status = dbUser.status;
      }
      return user;
    }
  }

  throw new AuthError("Unauthorized", 401);
}

/**
 * Get authenticated user with specific role(s) or throw.
 */
export async function requireRole(...roles: string[]) {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "AuthError";
  }
}
