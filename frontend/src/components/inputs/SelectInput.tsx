import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Select as RadixSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

interface Option {
  label: string;
  value: string;
}

interface SelectInputProps {
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  placeholderClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
  defaultOpen?: boolean;
}

export const SelectInput = forwardRef<HTMLDivElement, SelectInputProps>(
  (
    {
      options,
      value,
      onChange,
      name,
      readOnly,
      required,
      placeholder = "Select",
      className,
      buttonClassName,
      placeholderClassName,
      dropdownClassName,
      optionClassName,
      defaultOpen,
    },
    ref,
  ) => {
    const handleSelect = (val: string) => {
      if (readOnly) return;
      onChange?.(val);
    };

    return (
      <div ref={ref} className={cn("relative", className)}>
        {name && <input type="hidden" name={name} value={value ?? ""} required={required} readOnly={readOnly} />}

        <RadixSelect value={value} onValueChange={handleSelect} disabled={readOnly} defaultOpen={defaultOpen}>
          <SelectTrigger
            className={cn(
              "h-12 w-full rounded-xl border-neutral-700 bg-chat-input para-small-medium text-white! shadow-none data-[placeholder]:text-neutral-500 focus-visible:border-neutral-500 focus-visible:ring-0",
              readOnly && "cursor-not-allowed opacity-70",
              buttonClassName,
              placeholderClassName,
            )}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className={cn("border-neutral-700 bg-chat-input text-white", dropdownClassName)}>
            {options.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                className={cn(
                  "para-small-medium text-neutral-100 focus:bg-neutral-700 focus:text-white",
                  optionClassName,
                )}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </RadixSelect>
      </div>
    );
  },
);

SelectInput.displayName = "SelectInput";
