export function BootScreen({
  leaving = false,
  onFinished,
}: {
  leaving?: boolean;
  onFinished?: () => void;
}) {
  return (
    <div
      className="v98-startup"
      data-leaving={leaving}
      role="status"
      aria-live="polite"
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity" && leaving) {
          onFinished?.();
        }
      }}
    >
      <div className="v98-boot">
        <div className="v98-boot-brand">
          <span>VaelMail</span>
        </div>
        <span className="v98-boot-label">Starting VaelMail</span>
        <div className="v98-boot-track" aria-hidden>
          <i />
        </div>
      </div>
    </div>
  );
}
