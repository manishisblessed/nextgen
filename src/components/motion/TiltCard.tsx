"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps
} from "framer-motion";
import * as React from "react";
import { cn } from "@/lib/utils";

type TiltCardProps = Omit<HTMLMotionProps<"div">, "style" | "children"> & {
  children?: React.ReactNode;
  /** Max tilt in degrees on each axis. Default 8. */
  maxTilt?: number;
  /** translateZ applied to child .tilt-layer elements when hovered. Default 0 (no parallax). */
  intensity?: "subtle" | "normal" | "strong";
  /** Light glare overlay on hover. Default true. */
  glare?: boolean;
};

const intensityMap = {
  subtle: 6,
  normal: 10,
  strong: 16
} as const;

export function TiltCard({
  children,
  className,
  maxTilt,
  intensity = "subtle",
  glare = true,
  onMouseMove,
  onMouseLeave,
  ...rest
}: TiltCardProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  const tilt = maxTilt ?? intensityMap[intensity];

  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const springConfig = { stiffness: 220, damping: 22, mass: 0.4 };
  const sx = useSpring(mx, springConfig);
  const sy = useSpring(my, springConfig);

  const rotateX = useTransform(sy, [-0.5, 0.5], [tilt, -tilt]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-tilt, tilt]);

  const glareX = useTransform(sx, [-0.5, 0.5], ["20%", "80%"]);
  const glareY = useTransform(sy, [-0.5, 0.5], ["20%", "80%"]);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
    (onMouseMove as React.MouseEventHandler<HTMLDivElement> | undefined)?.(e);
  }

  function handleLeave(e: React.MouseEvent<HTMLDivElement>) {
    mx.set(0);
    my.set(0);
    (onMouseLeave as React.MouseEventHandler<HTMLDivElement> | undefined)?.(e);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn("relative will-change-transform", className)}
      style={{
        transformStyle: "preserve-3d",
        rotateX: reduce ? 0 : rotateX,
        rotateY: reduce ? 0 : rotateY
      }}
      {...rest}
    >
      {children}

      {glare && !reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(circle at var(--glx) var(--gly), rgba(255,255,255,0.35), transparent 45%)`,
            ["--glx" as string]: glareX,
            ["--gly" as string]: glareY,
            mixBlendMode: "overlay"
          }}
        />
      )}
    </motion.div>
  );
}
