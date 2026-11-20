import { Popover } from "@base-ui/react/popover";
import { WifiHighIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { connectionLabel, useConnection } from "@/features/connection/store";
import { bridge } from "@/lib/bridge";
import { useTheme } from "@/lib/theme";
import { RetroButton, RetroSurface } from "@/ui/retro98";

export function ConnectionIndicator() {
  const status = useConnection((state) => state.status);
  const online = useConnection((state) => state.online);
  const resolved = useTheme((state) => state.resolved);
  const label = connectionLabel({ status, online });
  const reachable = online && status !== "offline";

  return (
    <Popover.Root>
      <Popover.Trigger
        className="v98-connection-trigger"
        data-offline={!reachable}
        aria-label={`Mailbox connection: ${label}`}
        title={`Mailbox connection: ${label}`}
      >
        {reachable ? (
          <WifiHighIcon size={18} aria-hidden />
        ) : (
          <WifiSlashIcon size={18} aria-hidden />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Popover.Positioner side="top" align="end" sideOffset={9} className="v98-menu-positioner">
            <Popover.Popup className="v98-connection-popup" aria-label="Mailbox connection">
              <strong>{label}</strong>
              <p>
                {reachable
                  ? "VaelMail pushes new mail to this device as it arrives."
                  : "Showing saved mail. New mail will appear when the connection returns."}
              </p>
              <RetroButton onClick={() => void bridge.realtime.reconnect()}>
                Reconnect now
              </RetroButton>
            </Popover.Popup>
          </Popover.Positioner>
        </RetroSurface>
      </Popover.Portal>
    </Popover.Root>
  );
}
