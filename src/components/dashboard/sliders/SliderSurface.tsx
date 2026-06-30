"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type PublicSlider = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  kind: "SLIDE" | "POPUP";
  sortOrder: number;
};

const AUTOPLAY_MS = 6000;

function dismissedKey(userId: string, sliderId: string) {
  return `ngp:popup:dismissed:${userId}:${sliderId}`;
}

export function SliderSurface() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;

  const [slides, setSlides] = useState<PublicSlider[]>([]);
  const [popups, setPopups] = useState<PublicSlider[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sliders");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.slides)) setSlides(data.slides);
        if (Array.isArray(data.popups)) setPopups(data.popups);
      } catch {
        /* surface is non-critical — fail silently */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!loaded || !userId) return null;

  return (
    <>
      {slides.length > 0 && <SlideCarousel slides={slides} />}
      {popups.length > 0 && <PopupModal popups={popups} userId={userId} />}
    </>
  );
}

function SlideCarousel({ slides }: { slides: PublicSlider[] }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const count = slides.length;

  const go = useCallback(
    (next: number, d: number) => {
      setDir(d);
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => {
      setDir(1);
      setIndex((i) => (i + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [count]);

  const current = slides[index];
  const Wrapper = current.linkUrl ? "a" : "div";
  const wrapperProps = current.linkUrl
    ? { href: current.linkUrl, target: "_blank" as const, rel: "noreferrer" }
    : {};

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-ink-100 bg-ink-900 shadow-soft">
      <div className="relative aspect-[16/5] w-full sm:aspect-[16/4]">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={current.id}
            custom={dir}
            initial={{ x: dir > 0 ? "100%" : "-100%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir > 0 ? "-100%" : "100%", opacity: 0.4 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="absolute inset-0"
          >
            <Wrapper {...wrapperProps} className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.imageUrl} alt={current.title} className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/70 to-transparent p-4 sm:p-5">
                <p className="font-display text-sm font-semibold text-white sm:text-base">{current.title}</p>
              </div>
            </Wrapper>
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1, -1)}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-ink-800 shadow transition hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1, 1)}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-ink-800 shadow transition hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i, i > index ? 1 : -1)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PopupModal({ popups, userId }: { popups: PublicSlider[]; userId: string }) {
  // Pick the first (highest priority by sortOrder) popup not yet dismissed.
  const [active, setActive] = useState<PublicSlider | null>(null);

  const ordered = useMemo(
    () => [...popups].sort((a, b) => a.sortOrder - b.sortOrder),
    [popups]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = ordered.find((p) => {
      try {
        return window.localStorage.getItem(dismissedKey(userId, p.id)) !== "1";
      } catch {
        return true;
      }
    });
    setActive(next ?? null);
  }, [ordered, userId]);

  const dismiss = useCallback(() => {
    if (!active) return;
    try {
      window.localStorage.setItem(dismissedKey(userId, active.id), "1");
    } catch {
      /* ignore storage failures */
    }
    setActive(null);
  }, [active, userId]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-700 shadow transition hover:bg-white"
            >
              <X className="h-5 w-5" />
            </button>

            {active.linkUrl ? (
              <a href={active.linkUrl} target="_blank" rel="noreferrer" onClick={dismiss}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={active.imageUrl} alt={active.title} className="w-full object-cover" />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={active.imageUrl} alt={active.title} className="w-full object-cover" />
            )}

            <div className="p-5">
              <h3 className="font-display text-lg font-bold text-ink-900">{active.title}</h3>
              <button
                type="button"
                onClick={dismiss}
                className="mt-4 w-full rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:shadow-glow"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
