import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Tabs } from "@base-ui/react/tabs";
import { RetroSurface, type RetroTheme } from "./primitives";

const ThemeContext = createContext<RetroTheme>("graphite");

export function useRetroTheme(): RetroTheme {
  return useContext(ThemeContext);
}

export function RetroThemeScope({
  theme = "graphite",
  children,
}: {
  theme?: RetroTheme;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>
      <RetroSurface theme={theme}>{children}</RetroSurface>
    </ThemeContext.Provider>
  );
}

type TabDefinition = { id: string; label: ReactNode; content: ReactNode; disabled?: boolean };

export function RetroTabs({
  label,
  tabs,
  value,
  defaultValue,
  onValueChange,
}: {
  label: string;
  tabs: TabDefinition[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Tabs.Root
      value={value}
      defaultValue={defaultValue ?? tabs.find((tab) => !tab.disabled)?.id}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange?.(next);
      }}
    >
      <Tabs.List aria-label={label} className="v98-tabs-list">
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} disabled={tab.disabled} className="v98-tab">
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.id} value={tab.id} className="v98-tab-panel">
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

type MenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
};

export function RetroMenu({
  label,
  items,
  finalFocus,
}: {
  label: string;
  items: MenuItem[];
  finalFocus?: ComponentProps<typeof Menu.Popup>["finalFocus"];
}) {
  const theme = useRetroTheme();
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={label} className="v98-button">
        {label}
      </Menu.Trigger>
      <Menu.Portal>
        <RetroSurface theme={theme}>
          <Menu.Positioner sideOffset={3} className="v98-menu-positioner">
            <Menu.Popup className="v98-menu-popup" finalFocus={finalFocus}>
              {items.map((item) => (
                <Menu.Item
                  key={item.id}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                  className="v98-menu-item"
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span aria-hidden className="v98-muted">
                      {item.shortcut}
                    </span>
                  )}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </RetroSurface>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function RetroDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const theme = useRetroTheme();
  const id = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <RetroSurface theme={theme}>
          <Dialog.Backdrop className="v98-dialog-backdrop" />
          <Dialog.Popup className="window v98-dialog-popup" aria-describedby={`${id}-description`}>
            <div className="title-bar">
              <Dialog.Title className="title-bar-text">{title}</Dialog.Title>
              <div className="title-bar-controls">
                <Dialog.Close aria-label={`Close ${title}`}>
                  <span aria-hidden className="v98-caption-glyph">
                    ×
                  </span>
                </Dialog.Close>
              </div>
            </div>
            <div className="window-body">
              <Dialog.Description id={`${id}-description`} className="v98-dialog-description">
                {description}
              </Dialog.Description>
              {children}
            </div>
          </Dialog.Popup>
        </RetroSurface>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
