import { useId, type ComponentProps, type ReactNode } from "react";
import clsx from "clsx";

export type RetroTheme = "graphite" | "light" | "classic";

export function RetroSurface({
  theme = "graphite",
  className,
  ...props
}: ComponentProps<"div"> & { theme?: RetroTheme }) {
  return <div {...props} data-v98-theme={theme} className={clsx("vael98", className)} />;
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "primary" | "danger";
  busy?: boolean;
};

export function RetroButton({
  variant = "default",
  busy = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={busy || undefined}
      disabled={props.disabled || busy}
      data-variant={variant}
      className={clsx("v98-button", className)}
    >
      {children}
    </button>
  );
}

type WindowProps = Omit<ComponentProps<"section">, "title"> & {
  title: string;
  active?: boolean;
  maximized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  status?: ReactNode;
};

export function RetroWindow({
  title,
  active = true,
  maximized = false,
  onMinimize,
  onMaximize,
  onClose,
  status,
  className,
  children,
  ...props
}: WindowProps) {
  const titleId = useId();
  return (
    <section {...props} aria-labelledby={titleId} className={clsx("window", className)}>
      <div className={clsx("title-bar", !active && "inactive")}>
        <h2 id={titleId} className="title-bar-text">
          {title}
        </h2>
        <div className="title-bar-controls">
          {onMinimize && (
            <button type="button" aria-label={`Minimize ${title}`} onClick={onMinimize}>
              <span aria-hidden className="v98-caption-glyph">
                _
              </span>
            </button>
          )}
          {onMaximize && (
            <button
              type="button"
              aria-label={`${maximized ? "Restore" : "Maximize"} ${title}`}
              onClick={onMaximize}
            >
              <span aria-hidden className="v98-caption-glyph">
                {maximized ? "▣" : "□"}
              </span>
            </button>
          )}
          {onClose && (
            <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
              <span aria-hidden className="v98-caption-glyph">
                ×
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="window-body">{children}</div>
      {status && <div className="status-bar">{status}</div>}
    </section>
  );
}

export function RetroStatusField({ className, ...props }: ComponentProps<"p">) {
  return <p {...props} className={clsx("status-bar-field", className)} />;
}

export function RetroPanel({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={clsx("v98-panel", className)} />;
}

export function RetroFieldset({
  legend,
  children,
  ...props
}: ComponentProps<"fieldset"> & { legend: ReactNode }) {
  return (
    <fieldset {...props}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

type FieldControl = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

export function RetroField({
  label,
  description,
  error,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  label: string;
  description?: string;
  error?: string;
  children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy =
    [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div {...props} className={clsx("v98-field", className)}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {description && (
        <p id={descriptionId} className="v98-field-description">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="v98-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function RetroInput(props: ComponentProps<"input">) {
  return <input type="text" {...props} />;
}

export function RetroTextArea(props: ComponentProps<"textarea">) {
  return <textarea {...props} />;
}

export function RetroSelect(props: ComponentProps<"select">) {
  return <select {...props} />;
}

type ChoiceProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode };

function Choice({
  label,
  type,
  id: suppliedId,
  className,
  ...props
}: ChoiceProps & { type: "checkbox" | "radio" }) {
  const generated = useId();
  const id = suppliedId ?? generated;
  return (
    <div className={clsx("v98-choice", className)}>
      <input {...props} type={type} id={id} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function RetroCheckbox(props: ChoiceProps) {
  return <Choice {...props} type="checkbox" />;
}

export function RetroRadio(props: ChoiceProps) {
  return <Choice {...props} type="radio" />;
}

export function RetroRange(props: Omit<ComponentProps<"input">, "type">) {
  return <input {...props} type="range" />;
}

export function RetroProgress({
  label,
  className,
  ...props
}: Omit<ComponentProps<"progress">, "aria-label"> & { label: string }) {
  return <progress {...props} aria-label={label} className={clsx("v98-progress", className)} />;
}

export function RetroTree({ className, ...props }: ComponentProps<"ul">) {
  return <ul {...props} className={clsx("tree-view", className)} />;
}

export function RetroTable({ children, className, ...props }: ComponentProps<"table">) {
  return (
    <div className="v98-table-scroll">
      <table {...props} className={className}>
        {children}
      </table>
    </div>
  );
}

export function RetroToolbar({
  label,
  className,
  ...props
}: ComponentProps<"div"> & { label: string }) {
  return (
    <div {...props} role="group" aria-label={label} className={clsx("v98-toolbar", className)} />
  );
}

export function RetroToolbarSeparator() {
  return <span aria-hidden className="v98-toolbar-separator" />;
}
