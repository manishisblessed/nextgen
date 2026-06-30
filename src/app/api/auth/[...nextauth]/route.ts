import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-server";

const handler = NextAuth(authOptions);
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export { handler as GET, handler as POST };
