import { cn } from "@/utils/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-xl border border-neutral-700 bg-chat-input px-3 para-small-medium text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-500",
          props.readOnly && "cursor-not-allowed bg-neutral-800 text-neutral-400",
          className
        )}
        {...props}
      />
    );
  }
);
TextInput.displayName = "TextInput";
