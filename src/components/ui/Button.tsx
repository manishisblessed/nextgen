import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-soft hover:shadow-glow",
        secondary:
          "bg-ink-900 text-white hover:bg-ink-800",
        outline:
          "border border-ink-200 bg-white text-ink-900 hover:border-brand-300 hover:text-brand-700",
        ghost:
          "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
        accent:
          "bg-gradient-to-r from-accent-500 to-accent-400 text-ink-900 shadow-soft hover:shadow-glow",
        link: "text-brand-700 underline-offset-4 hover:underline"
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
