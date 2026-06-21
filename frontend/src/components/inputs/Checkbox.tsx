import { cn } from "@/lib/utils";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface CheckboxProps extends ComponentPropsWithoutRef<"input"> {
  className?: string;
}

export const CustomCheckbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "m-0 size-5 appearance-none rounded border border-solid border-neutral-700 bg-chat-input checked:border-richblue-300 checked:bg-richblue-300",
        props.readOnly && "cursor-not-allowed opacity-70",
        className,
      )}
      {...props}
    />
  );
});
CustomCheckbox.displayName = "CustomCheckbox";

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
