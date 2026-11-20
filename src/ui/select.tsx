import { Children, Fragment, isValidElement, type ReactNode, type ComponentProps } from "react";
import { Select } from "@base-ui/react/select";
import { CaretDownIcon, CaretUpIcon, CheckIcon } from "@phosphor-icons/react";
import clsx from "clsx";

type SelectOption = {
  value: string;
  label: ReactNode;
  text?: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
  disabled?: boolean;
};

function readOptions(children: ReactNode, group?: string): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        value?: string | number;
        children?: ReactNode;
        label?: string;
        disabled?: boolean;
      }>(child)
    )
      return;
    if (child.type === Fragment) options.push(...readOptions(child.props.children, group));
    else if (child.type === "optgroup")
      options.push(...readOptions(child.props.children, child.props.label));
    else if (child.type === "option")
      options.push({
        value: String(child.props.value ?? child.props.children ?? ""),
        label: child.props.children,
        disabled: child.props.disabled,
        group,
      });
  });
  return options;
}

export function VaelSelect({
  children,
  options: suppliedOptions,
  value,
  defaultValue,
  onChange,
  onValueChange,
  className,
  placeholder = "choose an option…",
  name,
  required,
  disabled,
  autoComplete,
  form,
  ...triggerProps
}: Omit<
  ComponentProps<typeof Select.Trigger>,
  "value" | "defaultValue" | "onChange" | "children"
> & {
  children?: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  required?: boolean;
  autoComplete?: string;
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  options?: SelectOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
}) {
  const options = suppliedOptions ?? readOptions(children);
  const groups = [...new Set(options.map((option) => option.group))];
  const controlled = value !== undefined;
  const item = (option: SelectOption) => (
    <Select.Item
      key={option.value}
      value={option.value}
      label={option.text}
      disabled={option.disabled}
      data-value={option.value}
      className="vael-select-item"
    >
      {option.icon && (
        <span className="vael-select-option-icon" aria-hidden="true">
          {option.icon}
        </span>
      )}
      <span className="vael-select-option-copy">
        <Select.ItemText>{option.label}</Select.ItemText>
        {option.description && (
          <span className="vael-select-description">{option.description}</span>
        )}
      </span>
      <Select.ItemIndicator className="vael-select-check">
        <CheckIcon size={16} weight="bold" aria-hidden="true" />
      </Select.ItemIndicator>
    </Select.Item>
  );
  return (
    <Select.Root
      items={options}
      value={controlled ? String(value) : undefined}
      defaultValue={controlled ? undefined : String(defaultValue ?? options[0]?.value ?? "")}
      name={name}
      required={required}
      disabled={disabled || !options.length}
      form={form}
      autoComplete={autoComplete ?? "off"}
      onValueChange={(next) => {
        if (next === null) return;
        onValueChange?.(next);
        onChange?.({ target: { value: next, name } });
      }}
    >
      <Select.Trigger
        {...triggerProps}
        data-value={value}
        className={clsx("vael-select", className)}
      >
        <Select.Value className="vael-select-value">
          {(current: string | null) => {
            const selected = options.find((option) => option.value === current);
            return selected ? (
              <>
                {selected.icon && (
                  <span className="vael-select-option-icon" aria-hidden="true">
                    {selected.icon}
                  </span>
                )}
                <span className="vael-select-value-label">{selected.label}</span>
              </>
            ) : (
              placeholder
            );
          }}
        </Select.Value>
        <Select.Icon className="vael-select-caret">
          <CaretDownIcon size={15} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="vael-select-positioner"
          sideOffset={6}
          alignItemWithTrigger={false}
          align="start"
          collisionPadding={12}
        >
          <Select.Popup className="vael-select-popup">
            <Select.ScrollUpArrow className="vael-select-scroll">
              <CaretUpIcon size={16} aria-hidden="true" />
            </Select.ScrollUpArrow>
            <Select.List className="vael-select-list">
              {groups.map((group) =>
                group ? (
                  <Select.Group key={group}>
                    <Select.GroupLabel className="vael-select-group">{group}</Select.GroupLabel>
                    {options.filter((option) => option.group === group).map(item)}
                  </Select.Group>
                ) : (
                  <Fragment key="ungrouped">
                    {options.filter((option) => !option.group).map(item)}
                  </Fragment>
                ),
              )}
            </Select.List>
            <Select.ScrollDownArrow className="vael-select-scroll">
              <CaretDownIcon size={16} aria-hidden="true" />
            </Select.ScrollDownArrow>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
