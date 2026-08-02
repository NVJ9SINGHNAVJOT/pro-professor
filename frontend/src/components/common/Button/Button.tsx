import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's button.
 *
 * Its one rule: **the label never changes.** Swapping "Save" for "Saving…" mid-action re-measures
 * the button, which shifts it and everything beside it — the jolt reads as a glitch rather than as
 * progress. Instead `pending` moves the fill to a pending tint and sweeps a highlight across it,
 * leaving the box exactly the size it was.
 *
 * `pending` also disables the button, so a double submit can't slip through while a request is in
 * flight; callers don't need to pass `disabled` as well.
 */

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Work is in flight: tint + sweep, label held still, clicks blocked. */
  pending?: boolean;
  /** Leading icon. Static like the label — swapping it would resize the button. */
  icon?: LucideIcon;
  /** Stretches to the container's width; otherwise the button hugs its label. */
  fullWidth?: boolean;
}

/** `--btn-sweep` has to read against each fill: dark highlight on light, light on dark. */
const VARIANTS: Record<Variant, { idle: string; pending: string; sweep: string }> = {
  primary: {
    idle: "bg-white text-black hover:bg-neutral-200",
    pending: "bg-sky-200 text-neutral-900",
    sweep: "rgb(0 0 0 / 0.16)",
  },
  secondary: {
    idle: "bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
    pending: "bg-sky-500/25 text-white",
    sweep: "rgb(255 255 255 / 0.22)",
  },
  ghost: {
    idle: "text-neutral-400 hover:bg-neutral-800 hover:text-white",
    pending: "bg-sky-500/15 text-white",
    sweep: "rgb(255 255 255 / 0.18)",
  },
};

const SIZES: Record<Size, string> = {
  sm: "gap-x-1.5 rounded-lg px-2.5 py-1 para-small-medium",
  md: "gap-x-2 rounded-lg px-4 py-2 para-small-medium",
};

const Button = ({
  children,
  variant = "primary",
  size = "md",
  pending = false,
  icon: Icon,
  fullWidth = false,
  disabled,
  className,
  ...props
}: ButtonProps) => {
  const styles = VARIANTS[variant];
  const blocked = disabled || pending;

  return (
    <button
      type="button"
      {...props}
      disabled={blocked}
      aria-busy={pending || undefined}
      style={pending ? ({ "--btn-sweep": styles.sweep } as React.CSSProperties) : undefined}
      className={cn(
        "flex cursor-pointer items-center justify-center transition-colors ease-in-out",
        SIZES[size],
        fullWidth && "w-full",
        pending ? styles.pending : styles.idle,
        pending && "btn-sweep",
        // A disabled button that isn't working is inert; a pending one still shows its tint.
        disabled && !pending && "cursor-not-allowed bg-neutral-800 text-neutral-500 hover:bg-neutral-800",
        className,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      {children}
    </button>
  );
};

export default Button;
