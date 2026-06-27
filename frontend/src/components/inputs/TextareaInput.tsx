import { cn } from "@/lib/utils";
import { forwardRef, type TextareaHTMLAttributes } from "react";

export const TextareaInput = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-25 w-full rounded-xl border border-neutral-700 bg-chat-input p-3 para-small-medium text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-500",
          props.readOnly && "cursor-not-allowed bg-neutral-800 text-neutral-400",
          className,
        )}
        {...props}
      />
    );
  },
);
TextareaInput.displayName = "TextareaInput";
