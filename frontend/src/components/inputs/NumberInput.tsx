import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

// Numeric-only input guards
const allowedControlKeys = new Set([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
]);

function createDigitOnlyKeyDown<T extends HTMLInputElement>(
  userHandler?: (e: React.KeyboardEvent<T>) => void,
) {
  return (e: React.KeyboardEvent<T>) => {
    if (!/^\d$/.test(e.key) && !allowedControlKeys.has(e.key)) {
      e.preventDefault();
    }

    if (userHandler) userHandler(e);
  };
}

function createBlurOnWheel<T extends HTMLInputElement>(
  userHandler?: (e: React.WheelEvent<T>) => void,
) {
  return (e: React.WheelEvent<T>) => {
    e.currentTarget.blur();
    if (userHandler) userHandler(e);
  };
}

function createDigitOnlyPaste<T extends HTMLInputElement>(
  userHandler?: (e: React.ClipboardEvent<T>) => void,
) {
  return (e: React.ClipboardEvent<T>) => {
    const pasted = e.clipboardData.getData("Text");
    if (!/^\d+$/.test(pasted)) {
      e.preventDefault();
    }

    if (userHandler) userHandler(e);
  };
}

function createDigitOnlyDrop<T extends HTMLInputElement>(
  userHandler?: (e: React.DragEvent<T>) => void,
) {
  return (e: React.DragEvent<T>) => {
    const text = e.dataTransfer.getData("text");
    if (!/^\d+$/.test(text)) {
      e.preventDefault();
    }

    if (userHandler) userHandler(e);
  };
}

export const NumberInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, onWheel, ...props }, ref) => {
  const handleKeyDown = createDigitOnlyKeyDown<HTMLInputElement>(
    props.onKeyDown,
  );
  const handleWheel = createBlurOnWheel<HTMLInputElement>(onWheel);
  const handlePaste = createDigitOnlyPaste<HTMLInputElement>(props.onPaste);
  const handleDrop = createDigitOnlyDrop<HTMLInputElement>(props.onDrop);

  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      className={cn(
        "h-12 w-full rounded-xl border border-neutral-700 bg-chat-input px-3 para-small-medium text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-500",
        props.readOnly && "cursor-not-allowed bg-neutral-800 text-neutral-400",
        className,
      )}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onPaste={handlePaste}
      onDrop={handleDrop}
      {...props}
    />
  );
});
NumberInput.displayName = "NumberInput";
