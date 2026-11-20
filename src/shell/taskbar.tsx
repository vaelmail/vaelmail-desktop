import { DesktopIcon } from "@phosphor-icons/react";
import { applications } from "@/lib/desktop/registry";
import { RetroButton } from "@/ui/retro98";
import { TrayClock } from "./clock";
import { ConnectionIndicator } from "./connection";
import { AppIcon } from "./icons";
import { Launcher } from "./launcher";
import { StartMenu } from "./start-menu";
import { useDesktop } from "./store";

const navigationKeys = ["ArrowLeft", "ArrowRight", "Home", "End"];

export function Taskbar({ onSignOut }: { onSignOut: () => void }) {
  const windows = useDesktop((state) => state.windows);
  const active = useDesktop((state) => state.active);
  const dispatch = useDesktop((state) => state.dispatch);

  const select = (id: string, minimized: boolean) => {
    dispatch({ type: "notification", id, unread: false });
    if (id === active && !minimized) dispatch({ type: "minimize", id });
    else dispatch({ type: "activate", id });
  };

  return (
    <footer className="v98-taskbar" aria-label="Desktop taskbar">
      <StartMenu onSignOut={onSignOut} />
      <Launcher />
      <RetroButton
        className="v98-show-desktop"
        aria-label="Show or restore desktop"
        title="Show or restore desktop"
        onClick={() => dispatch({ type: "show-desktop" })}
      >
        <DesktopIcon size={18} aria-hidden />
      </RetroButton>
      <nav
        className="v98-task-buttons"
        aria-label="Open applications"
        aria-describedby="v98-taskbar-help"
        onKeyDown={(event) => {
          if (!navigationKeys.includes(event.key)) return;
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(".v98-task-button"),
          ];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0 || buttons.length === 0) return;
          event.preventDefault();
          const step = event.key === "ArrowRight" ? 1 : -1;
          const target =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index + step + buttons.length) % buttons.length;
          buttons[target]?.focus();
        }}
      >
        <span className="sr-only" id="v98-taskbar-help">
          Use the arrow keys to move between applications. Alt+F6 switches windows from anywhere.
        </span>
        {windows.map((window) => {
          const title = window.title ?? applications[window.appId].title;
          return (
            <button
              type="button"
              key={window.id}
              className="v98-button v98-task-button"
              data-notification={window.notification || undefined}
              data-attention={window.attention || undefined}
              aria-label={title + (window.notification ? ", new notification" : "")}
              aria-pressed={window.id === active}
              title={title + (window.attention ? ", needs attention" : "")}
              onClick={() => select(window.id, window.mode === "minimized")}
            >
              <AppIcon icon={applications[window.appId].icon} size={17} />
              <span>{title}</span>
              {!!window.notification && (
                <span key={window.notification} className="v98-task-notification" aria-hidden />
              )}
              {window.attention && (
                <span className="v98-task-attention" aria-hidden>
                  !
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="v98-tray">
        <ConnectionIndicator />
        <TrayClock />
      </div>
    </footer>
  );
}
