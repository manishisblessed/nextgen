import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-accent-50">
      <div className="container-x flex h-16 items-center justify-between md:h-20">
        <Logo />
        <Link
          href="/"
          className="text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          ← Back to home
        </Link>
      </div>
      <main className="container-x flex min-h-[calc(100vh-5rem)] items-center justify-center py-10">
        {children}
      </main>
    </div>
  );
}
