import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role as string;
    const twoFactorEnabled = token?.twoFactorEnabled as boolean;

    // 2FA enforcement is handled client-side via the TwoFactorSetupModal overlay
    // in the dashboard layout — no redirect needed. The modal blocks all interaction
    // until setup is complete. API routes for 2FA setup still work normally.

    if (path.startsWith("/dashboard/master-admin") && role !== "MASTER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (path.startsWith("/dashboard/sub-admin") && role !== "SUPPORT" && role !== "MASTER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (path.startsWith("/dashboard/admin") && !["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(role)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*"],
};
