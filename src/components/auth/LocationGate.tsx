"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { MapPin, MapPinOff, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

type LocationGateProps = {
  children: (location: LocationData) => ReactNode;
};

type GateState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; location: LocationData }
  | { status: "denied"; reason: string }
  | { status: "unavailable" };

const BROWSER_TIMEOUT_MS = 10_000;
const SAFETY_TIMEOUT_MS = 12_000;

async function fetchIpLocation(): Promise<LocationData | null> {
  try {
    const res = await fetch("/api/geo/ip", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.latitude === "number" && typeof data.longitude === "number") {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy ?? 100_000,
        timestamp: Date.now(),
      };
    }
  } catch { /* swallow */ }
  return null;
}

export function LocationGate({ children }: LocationGateProps) {
  const [state, setState] = useState<GateState>({ status: "idle" });
  const resolved = useRef(false);

  const requestLocation = useCallback(() => {
    resolved.current = false;

    if (!navigator.geolocation) {
      // No browser support — go straight to IP fallback
      setState({ status: "requesting" });
      fetchIpLocation().then((loc) => {
        if (loc) {
          resolved.current = true;
          setState({ status: "granted", location: loc });
        } else {
          setState({ status: "unavailable" });
        }
      });
      return;
    }

    setState({ status: "requesting" });

    // Safety-net timer: if the browser API never calls back, use IP fallback
    const safetyTimer = setTimeout(() => {
      if (resolved.current) return;
      fetchIpLocation().then((loc) => {
        if (resolved.current) return;
        resolved.current = true;
        if (loc) {
          setState({ status: "granted", location: loc });
        } else {
          setState({
            status: "denied",
            reason: "Location request timed out. Please try again.",
          });
        }
      });
    }, SAFETY_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (resolved.current) return;
        resolved.current = true;
        clearTimeout(safetyTimer);
        setState({
          status: "granted",
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          },
        });
      },
      (error) => {
        if (resolved.current) return;
        clearTimeout(safetyTimer);

        // On denial/timeout, try IP fallback before giving up
        fetchIpLocation().then((loc) => {
          if (resolved.current) return;
          resolved.current = true;
          if (loc) {
            setState({ status: "granted", location: loc });
          } else {
            let reason = "Location access was denied.";
            if (error.code === error.POSITION_UNAVAILABLE) {
              reason = "Location information is unavailable on this device.";
            } else if (error.code === error.TIMEOUT) {
              reason = "Location request timed out. Please try again.";
            }
            setState({ status: "denied", reason });
          }
        });
      },
      {
        enableHighAccuracy: false,
        timeout: BROWSER_TIMEOUT_MS,
        maximumAge: 120_000,
      },
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  if (state.status === "granted") {
    return <>{children(state.location)}</>;
  }

  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-soft md:p-10">
      {state.status === "idle" || state.status === "requesting" ? (
        <>
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
            Verifying your location
          </h2>
          <p className="mt-2 max-w-xs text-sm text-ink-500">
            Please allow location access when prompted. This is required for
            security verification before login.
          </p>
        </>
      ) : state.status === "unavailable" ? (
        <>
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-50">
            <MapPinOff className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
            Location not supported
          </h2>
          <p className="mt-2 max-w-xs text-sm text-ink-500">
            Your browser does not support geolocation. Please use a modern
            browser with location capabilities to sign in.
          </p>
          <Button size="md" className="mt-5" onClick={requestLocation}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </>
      ) : (
        <>
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-50">
            <MapPin className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
            Location access required
          </h2>
          <p className="mt-2 max-w-xs text-sm text-ink-500">
            {state.reason}
          </p>
          <p className="mt-2 max-w-xs text-xs text-ink-400">
            Enable location permissions in your browser settings and try again.
            Without location verification, login is not allowed.
          </p>
          <Button
            size="md"
            className="mt-5"
            onClick={requestLocation}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </>
      )}

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>Location verification is mandatory for all users.</span>
      </div>
    </div>
  );
}
