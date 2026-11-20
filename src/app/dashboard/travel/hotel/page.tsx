"use client";

import { useState } from "react";
import { Hotel, MapPin, Star, Wifi, Coffee, Dumbbell, Car } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

const popularDestinations = [
  { city: "Goa", tagline: "Beaches & sunsets", gradient: "from-sky-400 to-cyan-500", emoji: "🏖️", from: 2499 },
  { city: "Jaipur", tagline: "Pink City heritage", gradient: "from-rose-400 to-pink-500", emoji: "🏰", from: 1899 },
  { city: "Shimla", tagline: "Hill station escape", gradient: "from-emerald-400 to-teal-500", emoji: "🏔️", from: 2199 },
  { city: "Mysuru", tagline: "Palace & culture", gradient: "from-amber-400 to-orange-500", emoji: "🏯", from: 1699 },
  { city: "Mumbai", tagline: "City that never sleeps", gradient: "from-violet-400 to-purple-500", emoji: "🌆", from: 3499 },
  { city: "Udaipur", tagline: "City of lakes", gradient: "from-blue-400 to-indigo-500", emoji: "🛶", from: 2799 },
];

const amenityPerks = [
  { icon: Wifi, label: "Free Wi-Fi" },
  { icon: Coffee, label: "Breakfast deals" },
  { icon: Dumbbell, label: "Gym access" },
  { icon: Car, label: "Free parking" },
];

const hotels = [
  {
    name: "The Lalit New Delhi",
    area: "Connaught Place",
    rating: 4.6,
    price: 7499
  },
  { name: "Taj Palace", area: "Sardar Patel Marg", rating: 4.8, price: 12999 },
  { name: "Lemon Tree Premier", area: "Aerocity", rating: 4.4, price: 5499 },
  { name: "ibis New Delhi", area: "Aerocity", rating: 4.3, price: 4799 },
  { name: "Radisson Blu", area: "Paschim Vihar", rating: 4.5, price: 6299 },
  { name: "OYO Townhouse 1024", area: "Karol Bagh", rating: 4.1, price: 1899 }
];

export default function HotelPage() {
  const [city, setCity] = useState("New Delhi");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [searched, setSearched] = useState(false);

  return (
    <div>
      <ServicePageHeader
        icon={Hotel}
        title="Hotel Booking"
        description="50,000+ hotels across India at exclusive agent rates."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearched(true);
        }}
        className="grid items-end gap-4 rounded-2xl border border-ink-100 bg-white p-6 lg:grid-cols-12"
      >
        <div className="lg:col-span-5">
          <Label>City / Hotel</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="lg:col-span-3">
          <Label>Check-in</Label>
          <Input
            type="date"
            required
            value={checkin}
            onChange={(e) => setCheckin(e.target.value)}
          />
        </div>
        <div className="lg:col-span-3">
          <Label>Check-out</Label>
          <Input
            type="date"
            required
            value={checkout}
            onChange={(e) => setCheckout(e.target.value)}
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
          {/* Popular destinations */}
          <div>
            <h3 className="mb-3 font-display text-sm font-semibold text-ink-900">Popular Destinations</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {popularDestinations.map((d) => (
                <button
                  key={d.city}
                  type="button"
                  onClick={() => setCity(d.city)}
                  className="group overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-soft"
                >
                  <div className={`flex h-20 items-center justify-center bg-gradient-to-br ${d.gradient}`}>
                    <span className="text-3xl">{d.emoji}</span>
                  </div>
                  <div className="p-2.5 text-left">
                    <p className="text-xs font-semibold text-ink-900">{d.city}</p>
                    <p className="text-[10px] text-ink-500">{d.tagline}</p>
                    <p className="mt-1 text-[10px] font-semibold text-brand-600">from {formatINR(d.from)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Amenity tags */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-ink-500 self-center font-medium mr-1">Filters agents love:</span>
            {amenityPerks.map((a) => (
              <span key={a.label} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700">
                <a.icon className="h-3.5 w-3.5 text-ink-400" />
                {a.label}
              </span>
            ))}
          </div>

          {/* Hero banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-accent-500 p-6 text-white">
            <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Agent Exclusive</p>
              <h3 className="mt-1 font-display text-xl font-bold">50,000+ hotels. Best agent rates.</h3>
              <p className="mt-1 max-w-md text-sm opacity-80">
                Search and book hotels for your customers with real-time availability. Earn commission on every booking.
              </p>
            </div>
            <Hotel className="absolute -right-4 -top-4 h-32 w-32 rotate-12 opacity-10" />
          </div>
        </div>
      )}

      {searched && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hotels.map((h) => (
            <div
              key={h.name}
              className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm"
            >
              <div className="relative h-36 bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100">
                <div className="absolute inset-0 bg-grid-pattern opacity-30" />
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  {h.rating}
                </span>
              </div>
              <div className="p-5">
                <h4 className="font-display text-base font-semibold text-ink-900">
                  {h.name}
                </h4>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-500">
                  <MapPin className="h-3 w-3" /> {h.area}, {city}
                </p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="font-display text-xl font-bold text-ink-900">
                      {formatINR(h.price)}
                    </p>
                    <p className="text-xs text-ink-500">per night, incl. taxes</p>
                  </div>
                  <Button size="sm">Book</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
