import Link from "next/link";
import { Mail, MapPin, Phone, Facebook, Twitter, Instagram, Linkedin, Youtube } from "lucide-react";
import { Logo } from "./Logo";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { footerLinks, company } from "@/lib/data";

export function Footer() {
  return (
    <footer className="relative border-t border-ink-100 bg-ink-950 text-ink-200">
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.04]" />
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo variant="light" />
            <p className="mt-4 max-w-sm text-sm text-ink-400">
              Payprism simplifies high-end fintech so anyone — from a village
              kirana to an urban distributor — can offer 60+ digital services
              and grow with us.
            </p>
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">
                Subscribe to our newsletter
              </p>
              <form className="mt-3 flex max-w-md gap-2">
                <Input
                  type="email"
                  placeholder="you@email.com"
                  className="border-white/10 bg-white/5 text-white placeholder:text-ink-500 focus:border-brand-400"
                />
                <Button type="submit" variant="accent">
                  Subscribe
                </Button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white">
              Company
            </h4>
            <ul className="space-y-3 text-sm">
              {footerLinks.company.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-ink-400 hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white">
              Services
            </h4>
            <ul className="space-y-3 text-sm">
              {footerLinks.services.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-ink-400 hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white">
              Legal
            </h4>
            <ul className="space-y-3 text-sm">
              {footerLinks.legal.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-ink-400 hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white">
              Contact
            </h4>
            <ul className="space-y-3 text-sm text-ink-400">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-brand-400" />
                <span>
                  {company.legalName}, {company.address}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand-400" />
                <span>+91 {company.phone}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-400" />
                <a href={`mailto:${company.email}`} className="hover:text-white">
                  {company.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-6 border-t border-white/10 pt-6 md:flex-row md:items-center">
          <div className="text-xs text-ink-500">
            <p>
              © {new Date().getFullYear()} {company.legalName}. All rights
              reserved.
            </p>
            <p className="mt-1">CIN: {company.cin}</p>
          </div>
          <div className="flex items-center gap-3 text-ink-400">
            <a aria-label="Twitter" href="#" className="hover:text-white">
              <Twitter className="h-4 w-4" />
            </a>
            <a aria-label="Facebook" href="#" className="hover:text-white">
              <Facebook className="h-4 w-4" />
            </a>
            <a aria-label="Instagram" href="#" className="hover:text-white">
              <Instagram className="h-4 w-4" />
            </a>
            <a aria-label="LinkedIn" href="#" className="hover:text-white">
              <Linkedin className="h-4 w-4" />
            </a>
            <a aria-label="YouTube" href="#" className="hover:text-white">
              <Youtube className="h-4 w-4" />
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
