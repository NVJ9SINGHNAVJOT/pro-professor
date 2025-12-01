import { cn } from "@/utils/cn";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Select as RadixSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const readOnlyBg = "bg-[#F5F5F6]";

// Shared event handlers for numeric-only inputs
const allowedControlKeys = new Set(["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"]);

function createDigitOnlyKeyDown<T extends HTMLInputElement>(userHandler?: (e: React.KeyboardEvent<T>) => void) {
  return (e: React.KeyboardEvent<T>) => {
    if (!/^\d$/.test(e.key) && !allowedControlKeys.has(e.key)) {
      e.preventDefault();
    }

    if (userHandler) userHandler(e);
  };
}

function createBlurOnWheel<T extends HTMLInputElement>(userHandler?: (e: React.WheelEvent<T>) => void) {
  return (e: React.WheelEvent<T>) => {
    e.currentTarget.blur();
    if (userHandler) userHandler(e);
  };
}

function createDigitOnlyPaste<T extends HTMLInputElement>(userHandler?: (e: React.ClipboardEvent<T>) => void) {
  return (e: React.ClipboardEvent<T>) => {
    const pasted = e.clipboardData.getData("Text");
    if (!/^\d+$/.test(pasted)) {
      e.preventDefault();
    }

    if (userHandler) userHandler(e);
  };
}

function createDigitOnlyDrop<T extends HTMLInputElement>(userHandler?: (e: React.DragEvent<T>) => void) {
  return (e: React.DragEvent<T>) => {
    const text = e.dataTransfer.getData("text");
    if (!/^\d+$/.test(text)) {
      e.preventDefault();
    }

    if (userHandler) userHandler(e);
  };
}

// STANDALONE INPUT COMPONENTS

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, maxLength, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-3 h-12 paragraph-regular bg-white border-solid border border-[#DEDFE0] rounded-lg text-neutral-700 placeholder:paragraph-medium placeholder-neutral-100 outline-none",
          props.readOnly ? readOnlyBg : "bg-white",
          className
        )}
        maxLength={maxLength}
        {...props}
      />
    );
  }
);
TextInput.displayName = "TextInput";

export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, onWheel, maxLength, ...props }, ref) => {
    const handleKeyDown = createDigitOnlyKeyDown<HTMLInputElement>(props.onKeyDown);
    const handleWheel = createBlurOnWheel<HTMLInputElement>(onWheel);
    const handlePaste = createDigitOnlyPaste<HTMLInputElement>(props.onPaste);
    const handleDrop = createDigitOnlyDrop<HTMLInputElement>(props.onDrop);

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={cn(
          "w-full px-3 h-12 paragraph-regular bg-white border-solid border border-[#DEDFE0] rounded-lg text-neutral-700 placeholder-neutral-100 outline-none",
          props.readOnly ? readOnlyBg : "bg-white",
          className
        )}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onPaste={handlePaste}
        onDrop={handleDrop}
        maxLength={maxLength}
        {...props}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";

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
    ref
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
              "paragraph-regular h-12 !text-neutral-700 shadow-none",
              readOnly && "cursor-not-allowed opacity-70",
              buttonClassName,
              placeholderClassName
            )}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className={cn(dropdownClassName)}>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className={cn("text-sm", optionClassName)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </RadixSelect>
      </div>
    );
  }
);

SelectInput.displayName = "SelectInput";

interface PhoneInputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefix?: string;
  prefixClassName?: string;
  inputWrapperClassName?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ prefix = "+91", className, prefixClassName, inputWrapperClassName, onWheel, ...props }, ref) => {
    const handleKeyDown = createDigitOnlyKeyDown<HTMLInputElement>(props.onKeyDown);
    const handleWheel = createBlurOnWheel<HTMLInputElement>(onWheel);
    const handlePaste = createDigitOnlyPaste<HTMLInputElement>(props.onPaste);
    const handleDrop = createDigitOnlyDrop<HTMLInputElement>(props.onDrop);

    return (
      <div className={cn("flex items-center border-solid border border-[#DEDFE0] rounded-lg", inputWrapperClassName)}>
        <div
          className={cn(
            "inline-flex items-center px-3 h-12 bg-white paragraph-regular text-neutral-100 text-sm outline-none rounded-l-lg",
            prefixClassName
          )}
        >
          {prefix}
        </div>
        <div className="w-[1px] h-8 bg-[#DEDFE0]" />
        <input
          ref={ref}
          type="text"
          className={cn(
            "w-full px-3 h-12 paragraph-regular bg-white text-neutral-700 placeholder-neutral-100 outline-none rounded-r-lg border-none",
            props.readOnly ? readOnlyBg : "bg-white",
            className
          )}
          maxLength={10}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          onPaste={handlePaste}
          onDrop={handleDrop}
          {...props}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full p-3 paragraph-regular bg-white border-solid border border-[#DEDFE0] rounded-lg text-neutral-700 placeholder-neutral-100 outline-none min-h-[100px]",
          props.readOnly ? readOnlyBg : "bg-white",
          className
        )}
        {...props}
      />
    );
  }
);
TextArea.displayName = "TextArea";

interface CheckboxProps extends ComponentPropsWithoutRef<"input"> {
  className?: string;
}

export const CustomCheckbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "w-5 h-5 m-0 bg-white border-solid border border-border-light rounded appearance-none checked:bg-blue-600 checked:border-blue-600",
        props.readOnly ? readOnlyBg : "bg-white",
        className
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
      <label className={cn("flex items-center space-x-[10px] cursor-pointer", wrapperClassName)}>
        <Checkbox
          ref={ref}
          className={cn(" border-neutral-30 bg-white border-solid shadow-none size-5", className)}
          {...props}
        />
        {label && <span className={cn("paragraph-regular text-neutral-700", labelClassName)}>{label}</span>}
      </label>
    );
  }
);
CheckboxInput.displayName = "CheckboxInput";

// FORM FIELD COMPONENT WITH REACT HOOK FORM

// Base properties for all form fields
interface BaseFormFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  showError?: boolean;
}

// Type-specific properties
interface SelectFieldProps {
  type: "select";
  options: Option[];
  buttonClassName?: string;
  placeholderClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
}

interface PhoneFieldProps {
  type: "phone";
  prefix?: string;
  prefixClassName?: string;
  inputWrapperClassName?: string;
}

interface CheckboxFieldProps {
  type: "checkbox";
  labelClassName?: string;
  wrapperClassName?: string;
}

interface TextFieldProps {
  type: "text" | "email";
  maxLength?: number;
}

interface NumberFieldProps {
  type: "number";
  maxLength?: number;
}

interface TextAreaFieldProps {
  type: "textarea";
}

// Union type for FormField props
type FormFieldProps<T extends FieldValues> = BaseFormFieldProps<T> & {
  type: "select" | "phone" | "checkbox" | "text" | "email" | "number" | "textarea";
} & Partial<
    Omit<SelectFieldProps, "type"> &
      Omit<PhoneFieldProps, "type"> &
      Omit<CheckboxFieldProps, "type"> &
      Omit<TextFieldProps, "type"> &
      Omit<NumberFieldProps, "type"> &
      Omit<TextAreaFieldProps, "type">
  >;

export type FormFieldConfig<T extends FieldValues> = Omit<FormFieldProps<T>, "control">;

export function FormField<T extends FieldValues>(props: FormFieldProps<T>) {
  const {
    control,
    name,
    label,
    type,
    placeholder,
    readOnly,
    required = false,
    className,
    inputClassName,
    showError = true,
  } = props;

  return (
    <div className={cn("", className)}>
      {type !== "checkbox" && label && (
        <label className="block paragraph-medium text-neutral-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const commonProps = {
            ...field,
            readOnly,
            required,
            placeholder,
          };

          switch (type) {
            case "select": {
              const selectProps = props as BaseFormFieldProps<T> & SelectFieldProps;
              return (
                <SelectInput
                  options={selectProps.options}
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                  readOnly={readOnly}
                  required={required}
                  placeholder={placeholder}
                  className={inputClassName}
                  buttonClassName={selectProps.buttonClassName}
                  placeholderClassName={selectProps.placeholderClassName}
                  dropdownClassName={selectProps.dropdownClassName}
                  optionClassName={selectProps.optionClassName}
                />
              );
            }

            case "phone": {
              const phoneProps = props as BaseFormFieldProps<T> & PhoneFieldProps;
              return (
                <PhoneInput
                  {...commonProps}
                  type="tel"
                  prefix={phoneProps.prefix}
                  className={inputClassName}
                  prefixClassName={phoneProps.prefixClassName}
                  inputWrapperClassName={phoneProps.inputWrapperClassName}
                />
              );
            }

            case "textarea":
              return <TextArea {...commonProps} className={inputClassName} />;

            case "number": {
              const numberProps = props as BaseFormFieldProps<T> & NumberFieldProps;
              return (
                <NumberInput
                  {...commonProps}
                  value={field.value ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = e.target?.value;
                    field.onChange(val === "" || val === null || typeof val === "undefined" ? undefined : Number(val));
                  }}
                  className={inputClassName}
                  maxLength={numberProps.maxLength}
                />
              );
            }

            case "checkbox": {
              const checkboxProps = props as BaseFormFieldProps<T> & CheckboxFieldProps;
              return (
                <CheckboxInput
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  name={field.name}
                  disabled={readOnly}
                  required={required}
                  label={label}
                  className={inputClassName}
                  labelClassName={checkboxProps.labelClassName}
                  wrapperClassName={checkboxProps.wrapperClassName}
                />
              );
            }

            default: {
              const textProps = props as BaseFormFieldProps<T> & TextFieldProps;
              return (
                <TextInput {...commonProps} type={type} className={inputClassName} maxLength={textProps.maxLength} />
              );
            }
          }
        }}
      />

      {showError && (
        <div className="min-h-[18px] mt-1">
          <Controller
            control={control}
            name={name}
            render={({ fieldState: { error } }) =>
              error ? <p className="text-[#C41F1F] caption-regular">{error.message}</p> : <></>
            }
          />
        </div>
      )}
    </div>
  );
}
