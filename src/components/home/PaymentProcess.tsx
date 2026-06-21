"use client";

import { ShoppingCart, CreditCard, Send, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

const steps = [
  {
    icon: ShoppingCart,
    title: "Customer initiates payment",
    text:
      "Your customer selects a service and hits Pay Now. They choose a method — Card, UPI, Net Banking, Wallet."
  },
  {
    icon: CreditCard,
    title: "Payment details entered",
    text:
      "Card details or UPI QR are securely encrypted (256-bit TLS) and sent to the payment gateway."
  },
  {
    icon: Send,
    title: "Gateway routes to issuer",
    text:
      "The payment gateway forwards the request to the bank or card network — Visa, Mastercard, RuPay or NPCI."
  },
  {
    icon: CheckCircle2,
    title: "Confirmation in seconds",
    text:
      "Funds are confirmed, the wallet is credited and you and your customer get an instant receipt."
  }
];

export function PaymentProcess() {
  return (
    <Section className="relative bg-ink-950 text-white">
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.05]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950" />

      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title={
              <span className="text-white">
                A simple 4-step{" "}
                <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
                  payment journey
                </span>
              </span>
            }
            description={
              <span className="text-ink-300">
                Behind every tap, NextGenPay runs a battle-tested gateway
                that processes millions of transactions every day with bank-grade
                security.
              </span>
            }
          />
        </Reveal>

        <div className="relative">
          {/* Animated connector line */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "left center" }}
            className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-brand-500/0 via-white/40 to-accent-500/0 lg:block"
          />
          <Stagger stagger={0.18} className="grid gap-6 lg:grid-cols-4">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <StaggerItem key={s.title} className="relative">
                  <div className="group relative z-10 mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow transition-transform duration-500 hover:scale-110 hover:-rotate-6">
                    <Icon className="h-6 w-6" />
                    <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-accent-500 text-xs font-bold text-ink-900 ring-4 ring-ink-950">
                      {i + 1}
                    </span>
                    {/* pulse ring */}
                    <span className="pointer-events-none absolute inset-0 rounded-2xl bg-brand-400/30 opacity-0 transition-opacity duration-500 group-hover:opacity-100 animate-pulse-ring" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-300">
                    {s.text}
                  </p>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </Container>
    </Section>
  );
}
