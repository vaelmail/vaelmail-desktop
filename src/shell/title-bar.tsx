import { MagnifyingGlassIcon, SignOutIcon } from "@phosphor-icons/react";
import { VerificationStatus } from "@/features/verification/verification-dialog";
import { BrandMark } from "./brand";
import { ConnectionIndicator } from "./connection";
import { modifierLabel, platform } from "./platform";
import { WindowControls } from "./window-controls";

export function TitleBar({ title, onSignOut }: { title: string; onSignOut?: () => void }) {
  return (
    <header className="vx-titlebar" data-platform={platform} data-tauri-drag-region>
      <div className="vx-titlebar-brand" data-tauri-drag-region>
        <BrandMark className="vx-brand-mark" />
        <span className="vx-titlebar-name" data-tauri-drag-region>
          VaelMail
        </span>
        {title && (
          <>
            <span className="vx-titlebar-divider" aria-hidden data-tauri-drag-region />
            <span className="vx-titlebar-title" data-tauri-drag-region>
              {title}
            </span>
          </>
        )}
      </div>
      {onSignOut && (
        <button
          type="button"
          className="vx-search-trigger"
          onClick={() => window.dispatchEvent(new Event("vael:launcher"))}
        >
          <MagnifyingGlassIcon size={15} aria-hidden />
          <span>Go to anything</span>
          <kbd>{modifierLabel} K</kbd>
        </button>
      )}
      <div className="vx-titlebar-end" data-tauri-drag-region>
        <VerificationStatus />
        {onSignOut && (
          <>
            <ConnectionIndicator />
            <button
              type="button"
              className="vx-icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={onSignOut}
            >
              <SignOutIcon size={17} />
            </button>
          </>
        )}
        <WindowControls />
      </div>
    </header>
  );
}
