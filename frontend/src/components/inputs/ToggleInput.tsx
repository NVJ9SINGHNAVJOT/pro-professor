import { cn } from "@/lib/utils";

interface ToggleInputProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Labeled on/off switch with an optional description line. */
export const ToggleInput = ({ label, description, checked, onChange, disabled, className }: ToggleInputProps) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    disabled={disabled}
    className={cn(
      "flex w-full items-center justify-between gap-3 text-left",
      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      className,
    )}
  >
    <span>
      <span className="block caption-small-regular text-neutral-200">{label}</span>
      {description && <span className="block caption-small-regular text-neutral-500">{description}</span>}
    </span>
    <span
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-richblue-300" : "bg-neutral-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </span>
  </button>
);
