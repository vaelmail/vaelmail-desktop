import { createContext, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Tooltip } from "@base-ui/react/tooltip";
import { CircleNotchIcon, EnvelopeSimpleIcon, XIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useWindowCloseGuard } from "@/shell/close-guard";
import { AppLink } from "@/shell/app-link";
import { navigateWindow } from "@/shell/store";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  danger?: boolean;
  busy?: boolean;
};

export function Button({ children, primary, danger, busy, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={clsx("wm-button", primary && "primary", danger && "danger", className)}
    >
      {busy && <CircleNotchIcon className="wm-spin" size={16} />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            {...props}
            aria-label={label}
            className={clsx("wm-icon", props.className)}
          />
        }
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className="wm-tooltip-positioner" sideOffset={6}>
          <Tooltip.Popup className="wm-tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  useWindowCloseGuard(() => {
    if (open) throw new Error("Finish or cancel the open dialog before closing this application.");
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="wm-backdrop" />
        <Dialog.Popup className={clsx("wm-dialog", wide && "wide", className)}>
          <div className="wm-modal-heading">
            <div>
              <Dialog.Title className="wm-title">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="wm-muted">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="wm-icon" aria-label="close dialog">
              <XIcon size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type MenuEntry = {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  checked?: boolean;
};

export function Dropdown({
  label,
  children,
  items,
  className,
}: {
  label: string;
  children: ReactNode;
  items: MenuEntry[];
  className?: string;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className={clsx("wm-icon", className)} aria-label={label}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="wm-menu-positioner" sideOffset={8} align="end">
          <Menu.Popup className="wm-menu">
            {items.map((item, index) =>
              item.checked !== undefined ? (
                <Menu.CheckboxItem
                  key={index}
                  className="wm-menu-item"
                  checked={item.checked}
                  onCheckedChange={item.action}
                  disabled={item.disabled}
                  closeOnClick
                >
                  <span className="v98-filter-check" aria-hidden>
                    {item.checked ? "✓" : ""}
                  </span>
                  {item.label}
                </Menu.CheckboxItem>
              ) : (
                <Menu.Item
                  key={index}
                  className={clsx("wm-menu-item", item.danger && "danger")}
                  disabled={item.disabled}
                  onClick={item.action}
                >
                  {item.icon}
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="wm-empty">
      <div className="wm-empty-symbol">
        <EnvelopeSimpleIcon size={28} weight="thin" />
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="wm-empty" role="alert">
      <h2>couldn&#39;t load this</h2>
      <p>{error.message}</p>
      <Button onClick={retry}>try again</Button>
    </div>
  );
}

export function Skeleton({ variant = "list" }: { variant?: "list" | "reader" | "panel" } = {}) {
  const rows = variant === "reader" ? [1, 2, 3] : [1, 2, 3, 4, 5];
  return (
    <div
      className={"wm-skeleton wm-skeleton-" + variant}
      aria-label="Loading content"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading content…</span>
      {rows.map((row) => (
        <div key={row}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function Confirm({
  title,
  description,
  trigger,
  action,
}: {
  title: string;
  description: string;
  trigger: (open: () => void) => ReactNode;
  action: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    try {
      await action();
      setOpen(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {trigger(() => {
        setError("");
        setOpen(true);
      })}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={title}
        description={description}
      >
        {error && (
          <p className="wm-field-error" role="alert">
            {error}
          </p>
        )}
        <div className="wm-modal-actions">
          <Button disabled={busy} onClick={() => setOpen(false)}>
            cancel
          </Button>
          <Button danger busy={busy} onClick={() => void confirm()}>
            confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}

export const MailLink = AppLink;

export function navigateMail(destination: string, options?: { onCommitted?: () => void }) {
  void navigateWindow("mail", destination).then(() => options?.onCommitted?.());
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
  className?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} {...(className ? { className } : {})}>
      {children}
    </Modal>
  );
}

export const OverlayClassContext = createContext<string | undefined>(undefined);
