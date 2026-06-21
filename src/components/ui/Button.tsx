import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "group/btn inline-flex items-center justify-center gap-2 rounded-full font-semibold will-change-transform select-none transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:transition-transform [&_svg]:duration-200 [&_svg]:ease-out hover:[&_svg:last-child]:translate-x-0.5",
  {
    variants: {
      variant: {
        primary:
          "btn-shine bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-soft hover:shadow-glow",
        secondary:
          "bg-ink-900 text-white hover:bg-ink-800 hover:shadow-soft",
        outline:
          "border border-ink-200 bg-white text-ink-900 hover:border-brand-300 hover:text-brand-700 hover:shadow-soft",
        ghost:
          "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
        accent:
          "btn-shine bg-gradient-to-r from-accent-500 to-accent-400 text-ink-900 shadow-soft hover:shadow-glow",
        link: "text-brand-700 underline-offset-4 hover:underline hover:translate-y-0"
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
