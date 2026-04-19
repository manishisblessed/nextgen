import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: {
    default: "Payprism — Banking, Bills & Travel for Bharat",
    template: "%s · Payprism"
  },
  description:
    "Payprism (Payprism Technology Pvt. Ltd.) is a digital fintech platform offering 60+ services — AePS, money transfer, recharges, bill payments and travel bookings — for retailers and consumers across India.",
  keywords: [
    "Payprism",
    "payprismindia",
    "AePS",
    "money transfer",
    "DMT",
    "recharge",
    "bill payment",
    "fintech India",
    "agent banking"
  ],
  metadataBase: new URL("https://payprismindia.com"),
  openGraph: {
    title: "Payprism — Banking, Bills & Travel for Bharat",
    description:
      "60+ digital services for retailers and consumers — AePS, money transfer, recharges, bill payments, travel.",
    url: "https://payprismindia.com",
    siteName: "Payprism",
    type: "website"
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
