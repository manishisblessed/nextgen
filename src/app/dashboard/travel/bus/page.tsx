"use client";

import { useState } from "react";
import { Bus, Snowflake, Armchair, Zap, Star } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

const cities = [
  "Delhi",
  "Mumbai",
  "Bengaluru",
  "Chennai",
  "Hyderabad",
  "Pune",
  "Jaipur",
  "Kolkata",
  "Lucknow",
  "Chandigarh"
];

const popularBusRoutes = [
  { from: "Delhi", to: "Jaipur", duration: "5h 30m", price: 599, tag: "Top route" },
  { from: "Mumbai", to: "Pune", duration: "3h 00m", price: 349, tag: "Most booked" },
  { from: "Bengaluru", to: "Chennai", duration: "7h 00m", price: 749, tag: "Night special" },
  { from: "Hyderabad", to: "Bengaluru", duration: "10h 00m", price: 899, tag: "Volvo available" },
  { from: "Delhi", to: "Chandigarh", duration: "4h 30m", price: 449, tag: "Budget pick" },
  { from: "Jaipur", to: "Udaipur", duration: "6h 00m", price: 649, tag: "Scenic route" },
];

const busTypes = [
  { icon: Snowflake, label: "AC Sleeper", desc: "Full flat bed, overnight comfort" },
  { icon: Armchair, label: "Semi-Sleeper", desc: "Recliner seats for mid-range trips" },
  { icon: Zap, label: "Volvo Multi-Axle", desc: "Premium suspension, Wi-Fi onboard" },
  { icon: Star, label: "Non-AC Seater", desc: "Budget-friendly for short routes" },
];

const buses = [
  { name: "VRL Travels", type: "AC Sleeper", depart: "21:30", arrive: "07:45", fare: 1199, seats: 12 },
  { name: "SRS Travels", type: "AC Semi-Sleeper", depart: "20:00", arrive: "07:00", fare: 899, seats: 8 },
  { name: "Orange Tours", type: "Volvo Multi-Axle", depart: "22:15", arrive: "08:30", fare: 1399, seats: 5 },
  { name: "RedBus Express", type: "Non-AC Seater", depart: "19:45", arrive: "06:30", fare: 599, seats: 22 }
];

export default function BusPage() {
  const [from, setFrom] = useState(cities[0]);
  const [to, setTo] = useState(cities[5]);
  const [date, setDate] = useState("");
  const [searched, setSearched] = useState(false);

  return (
    <div>
      <ServicePageHeader
        icon={Bus}
        title="Bus Booking"
        description="Book AC sleeper, semi-sleeper and seater buses across India."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearched(true);
        }}
        className="grid items-end gap-4 rounded-2xl border border-ink-100 bg-white p-6 lg:grid-cols-12"
      >
        <div className="lg:col-span-4">
          <Label>From</Label>
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="lg:col-span-4">
          <Label>To</Label>
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="lg:col-span-3">
          <Label>Travel date</Label>
          <Input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="lg:col-span-1">
          <Button type="submit" size="lg" className="w-full">
            Search
          </Button>
        </div>
      </form>

      {!searched && (
        <div className="mt-8 space-y-8">
          {/* Bus types */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {busTypes.map((t) => (
              <div key={t.label} className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <t.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink-900">{t.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Popular routes */}
          <div>
            <h3 className="mb-3 font-display text-sm font-semibold text-ink-900">Popular Bus Routes</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {popularBusRoutes.map((r) => (
                <button
                  key={r.from + r.to}
                  type="button"
                  onClick={() => {
                    if (cities.includes(r.from)) setFrom(r.from);
                    if (cities.includes(r.to)) setTo(r.to);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group flex items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-ink-900">{r.from}</span>
                      <Bus className="h-3 w-3 text-ink-300" />
                      <span className="font-display text-sm font-bold text-ink-900">{r.to}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-ink-500">{r.duration}</span>
                      <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                        {r.tag}
                      </span>
                    </div>
                  </div>
                  <p className="font-display text-sm font-bold text-brand-600">
                    from {formatINR(r.price)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Hero banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-accent-500 p-6 text-white">
            <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Agent Exclusive</p>
              <h3 className="mt-1 font-display text-xl font-bold">Book buses, earn commission</h3>
              <p className="mt-1 max-w-md text-sm opacity-80">
                AC sleeper, Volvo, and budget seater buses across India. Instant ticket issuance with agent commission on every booking.
              </p>
            </div>
            <Bus className="absolute -right-4 -top-4 h-32 w-32 rotate-12 opacity-10" />
          </div>
        </div>
      )}

      {searched && (
        <div className="mt-6 space-y-3">
          {buses.map((b) => (
            <div
              key={b.name}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-5"
            >
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Bus className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-base font-semibold text-ink-900">
                    {b.name}
                  </p>
                  <p className="text-xs text-ink-500">{b.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="font-display text-base font-bold text-ink-900">
                    {b.depart}
                  </p>
                  <p className="text-xs text-ink-500">{from}</p>
                </div>
                <div>
                  <p className="font-display text-base font-bold text-ink-900">
                    {b.arrive}
                  </p>
                  <p className="text-xs text-ink-500">{to}</p>
                </div>
                <div className="text-xs text-emerald-700">{b.seats} seats left</div>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold text-ink-900">
                  {formatINR(b.fare)}
                </p>
                <Button size="sm" className="mt-2">
                  Select seats
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
