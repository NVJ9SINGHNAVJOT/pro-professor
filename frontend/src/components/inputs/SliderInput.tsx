import { cn } from "@/lib/utils";

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
}

/** Labeled range slider showing the current value and its min/max bounds. */
export const SliderInput = ({ label, value, min, max, step, onChange, className }: SliderInputProps) => (
  <label className={cn("block", className)}>
    <div className="mb-1 flex items-center justify-between">
      <span className="caption-small-regular text-neutral-300">{label}</span>
      <span className="caption-small-regular tabular-nums text-neutral-400">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ct-range h-1 w-full cursor-pointer accent-richblue-300"
    />
    <div className="mt-1 flex items-center justify-between caption-small-regular tabular-nums text-neutral-500">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  </label>
);
