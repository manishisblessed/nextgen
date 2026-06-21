"use client";

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants
} from "framer-motion";
import * as React from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

type RevealProps = Omit<HTMLMotionProps<"div">, "variants" | "children"> & {
  children?: React.ReactNode;
  /** Direction the element travels from. Default "up". */
  direction?: Direction;
  /** Distance in px the element travels. Default 28. */
  distance?: number;
  /** Delay in seconds before this element animates. Default 0. */
  delay?: number;
  /** Duration in seconds. Default 0.6. */
  duration?: number;
  /** Trigger only once when entering view. Default true. */
  once?: boolean;
  /** IntersectionObserver amount in [0,1]. Default 0.2. */
  amount?: number;
  /** Render as a specific element. Default div. */
  as?: keyof typeof motion;
};

const easeOut = [0.22, 1, 0.36, 1] as const;

function offset(direction: Direction, distance: number) {
  switch (direction) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export function Reveal({
  children,
  direction = "up",
  distance = 28,
  delay = 0,
  duration = 0.6,
  once = true,
  amount = 0.2,
  as = "div",
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;

  const off = reduce ? { x: 0, y: 0 } : offset(direction, distance);

  const variants: Variants = {
    hidden: { opacity: 0, ...off },
    show: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        delay,
        duration: reduce ? 0 : duration,
        ease: easeOut
      }
    }
  };

  return (
    <MotionTag
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
      variants={variants}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}
