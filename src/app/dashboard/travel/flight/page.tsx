"use client";

import { useState } from "react";
import { Plane, ArrowRightLeft, TrendingUp, Clock, Shield, Tag } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

const cities = [
  "DEL · Delhi",
  "BOM · Mumbai",
  "BLR · Bengaluru",
  "MAA · Chennai",
  "CCU · Kolkata",
  "HYD · Hyderabad",
  "GOI · Goa",
  "PNQ · Pune",
  "AMD · Ahmedabad",
  "JAI · Jaipur"
];

type Flight = {
  airline: string;
  flightNo: string;
  depart: string;
  arrive: string;
  duration: string;
  fare: number;
  stops: string;
};

const popularRoutes = [
  { from: "DEL", fromCity: "Delhi", to: "BOM", toCity: "Mumbai", price: 3499, tag: "Most booked" },
  { from: "BLR", fromCity: "Bengaluru", to: "DEL", toCity: "Delhi", price: 4199, tag: "Best value" },
  { from: "BOM", fromCity: "Mumbai", to: "GOI", toCity: "Goa", price: 2899, tag: "Weekend getaway" },
  { from: "DEL", fromCity: "Delhi", to: "HYD", toCity: "Hyderabad", price: 3799, tag: "Top route" },
  { from: "CCU", fromCity: "Kolkata", to: "BLR", toCity: "Bengaluru", price: 4599, tag: "Business favourite" },
  { from: "MAA", fromCity: "Chennai", to: "BOM", toCity: "Mumbai", price: 3999, tag: "High demand" },
];

const perks = [
  { icon: TrendingUp, label: "Best Agent Fares", desc: "Exclusive rates not available publicly" },
  { icon: Clock, label: "Instant Confirmation", desc: "Tickets issued in under 60 seconds" },
  { icon: Shield, label: "Secure Payments", desc: "PCI-DSS compliant payment gateway" },
  { icon: Tag, label: "Commission Earned", desc: "Earn on every booking you make" },
];

const sampleFlights: Flight[] = [
  {
    airline: "IndiGo",
    flightNo: "6E-2031",
    depart: "06:15",
    arrive: "08:45",
    duration: "2h 30m",
    fare: 4299,
    stops: "Non-stop"
  },
  {
    airline: "Air India",
    flightNo: "AI-805",
    depart: "08:50",
    arrive: "11:25",
    duration: "2h 35m",
    fare: 4799,
    stops: "Non-stop"
  },
  {
    airline: "Vistara",
    flightNo: "UK-995",
    depart: "13:10",
    arrive: "15:55",
    duration: "2h 45m",
    fare: 5299,
    stops: "Non-stop"
  },
  {
    airline: "SpiceJet",
    flightNo: "SG-160",
    depart: "18:35",
    arrive: "21:15",
    duration: "2h 40m",
    fare: 3899,
    stops: "Non-stop"
  }
];

export default function FlightPage() {
  const [from, setFrom] = useState(cities[0]);
  const [to, setTo] = useState(cities[2]);
  const [date, setDate] = useState("");
  const [pax, setPax] = useState(1);
  const [searched, setSearched] = useState(false);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <div>
      <ServicePageHeader
        icon={Plane}
        title="Flight Booking"
        description="Search and book domestic flights with the best agent fares."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearched(true);
        }}
        className="rounded-2xl border border-ink-100 bg-white p-6"
      >
        <div className="grid items-end gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Label>From</Label>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-1 flex items-center justify-center pb-1">
            <button
              type="button"
              onClick={swap}
              aria-label="Swap"
              className="grid h-10 w-10 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="lg:col-span-3">
            <Label>To</Label>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Label>Departure</Label>
            <Input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Label>Travellers</Label>
            <Select value={pax} onChange={(e) => setPax(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} {n > 1 ? "Adults" : "Adult"}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-1">
            <Button type="submit" size="lg" className="w-full">
              Search
            </Button>
          </div>
        </div>
      </form>

      {!searched && (
        <div className="mt-8 space-y-8">
          {/* Perks */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {perks.map((p) => (
              <div key={p.label} className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <p.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink-900">{p.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Popular Routes */}
          <div>
            <h3 className="mb-3 font-display text-sm font-semibold text-ink-900">Popular Routes</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {popularRoutes.map((r) => (
                <button
                  key={r.from + r.to}
                  type="button"
                  onClick={() => {
                    const fromVal = cities.find((c) => c.startsWith(r.from)) ?? cities[0];
                    const toVal = cities.find((c) => c.startsWith(r.to)) ?? cities[2];
                    setFrom(fromVal);
                    setTo(toVal);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group flex items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold text-ink-900">{r.from}</span>
                      <Plane className="h-3.5 w-3.5 rotate-90 text-ink-300" />
                      <span className="font-display text-base font-bold text-ink-900">{r.to}</span>
                    </div>
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                      {r.tag}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm font-bold text-brand-600">
                      from {formatINR(r.price)}
                    </p>
                    <p className="text-[10px] text-ink-400">{r.fromCity} → {r.toCity}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Hero banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-accent-500 p-6 text-white">
            <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Agent Exclusive</p>
              <h3 className="mt-1 font-display text-xl font-bold">Fly smarter, earn more</h3>
              <p className="mt-1 max-w-md text-sm opacity-80">
                Book domestic flights for your customers and earn commission on every ticket. Best fares, instant issuance.
              </p>
            </div>
            <Plane className="absolute -right-4 -top-4 h-32 w-32 rotate-12 opacity-10" />
          </div>
        </div>
      )}

      {searched && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink-900">
              {sampleFlights.length} flights found · {from.split(" · ")[0]} →{" "}
              {to.split(" · ")[0]}
            </h3>
          </div>
          {sampleFlights.map((f) => (
            <div
              key={f.flightNo}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-5"
            >
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Plane className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-sm font-semibold text-ink-900">
                    {f.airline}
                  </p>
                  <p className="text-xs text-ink-500">{f.flightNo}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="font-display text-lg font-bold text-ink-900">
                    {f.depart}
                  </p>
                  <p className="text-xs text-ink-500">{from.split(" · ")[0]}</p>
                </div>
                <div className="flex flex-col items-center text-xs text-ink-500">
                  <span>{f.duration}</span>
                  <span className="my-1 h-px w-16 bg-ink-200" />
                  <span>{f.stops}</span>
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-ink-900">
                    {f.arrive}
                  </p>
                  <p className="text-xs text-ink-500">{to.split(" · ")[0]}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold text-ink-900">
                  {formatINR(f.fare * pax)}
                </p>
                <p className="text-xs text-ink-500">
                  for {pax} {pax > 1 ? "travellers" : "traveller"}
                </p>
                <Button size="sm" className="mt-2">
                  Book
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
