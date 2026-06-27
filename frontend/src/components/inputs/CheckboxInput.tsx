import { cn } from "@/lib/utils";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface CheckboxInputProps extends ComponentPropsWithoutRef<typeof Checkbox> {
  label?: string;
  labelClassName?: string;
  wrapperClassName?: string;
}

export const CheckboxInput = forwardRef<React.ComponentRef<typeof Checkbox>, CheckboxInputProps>(
  ({ label, className, labelClassName, wrapperClassName, ...props }, ref) => {
    return (
      <label className={cn("flex cursor-pointer items-center space-x-2.5", wrapperClassName)}>
        <Checkbox
          ref={ref}
          className={cn(
            "size-5 border-solid border-neutral-700 bg-chat-input shadow-none data-[state=checked]:border-richblue-300 data-[state=checked]:bg-richblue-300 data-[state=checked]:text-white",
            className,
          )}
          {...props}
        />
        {label && <span className={cn("para-small-medium text-neutral-100", labelClassName)}>{label}</span>}
      </label>
    );
  },
);
CheckboxInput.displayName = "CheckboxInput";
