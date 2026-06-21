"use client";

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants
} from "framer-motion";
import * as React from "react";

const easeOut = [0.22, 1, 0.36, 1] as const;

type StaggerProps = Omit<HTMLMotionProps<"div">, "variants" | "children"> & {
  children?: React.ReactNode;
  /** Stagger gap between children, seconds. Default 0.08. */
  stagger?: number;
  /** Delay before the first child animates, seconds. Default 0. */
  delayChildren?: number;
  /** IntersectionObserver amount. Default 0.15. */
  amount?: number;
  /** Animate only once. Default true. */
  once?: boolean;
};

export function Stagger({
  children,
  stagger = 0.08,
  delayChildren = 0,
  amount = 0.15,
  once = true,
  ...rest
}: StaggerProps) {
  const reduce = useReducedMotion();

  const variants: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduce ? 0 : stagger,
        delayChildren: reduce ? 0 : delayChildren
      }
    }
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
      variants={variants}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = Omit<HTMLMotionProps<"div">, "variants" | "children"> & {
  children?: React.ReactNode;
  /** Travel distance in px. Default 24. */
  distance?: number;
  /** Direction of entry. Default "up". */
  direction?: "up" | "down" | "left" | "right";
  /** Duration in seconds. Default 0.55. */
  duration?: number;
};

function offset(
  direction: "up" | "down" | "left" | "right",
  distance: number
) {
  switch (direction) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
  }
}

export function StaggerItem({
  children,
  distance = 24,
  direction = "up",
  duration = 0.55,
  ...rest
}: StaggerItemProps) {
  const reduce = useReducedMotion();
  const off = reduce ? { x: 0, y: 0 } : offset(direction, distance);

  const variants: Variants = {
    hidden: { opacity: 0, ...off },
    show: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: reduce ? 0 : duration, ease: easeOut }
    }
  };

  return (
    <motion.div variants={variants} {...rest}>
      {children}
    </motion.div>
  );
}
