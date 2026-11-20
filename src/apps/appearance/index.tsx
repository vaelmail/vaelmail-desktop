import { useMail } from "@/features/mailbox/context";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { RetroFieldset } from "@/ui/retro98";
import { toast } from "sonner";

const schemes = [
  { value: "dark", label: "Graphite", description: "Dark metal & soft green" },
  { value: "light", label: "Light", description: "Pale surfaces & dark text" },
  { value: "system", label: "Use system setting", description: "Follow your device" },
] as const;

export default function AppearanceApp() {
  const choice = useTheme((state) => state.choice);
  const setChoice = useTheme((state) => state.setChoice);
  const { setSettings } = useMail();

  const choose = (value: ThemeChoice) => {
    if (value === choice) return;
    setChoice(value);
    setSettings({ theme: value }).catch((failure: Error) => toast.error(failure.message));
  };

  return (
    <div className="v98-appearance v98-stack">
      <h1>Appearance</h1>
      <p>Choose the desktop colors for this device.</p>
      <RetroFieldset legend="Color scheme" className="v98-scheme-choices">
        {schemes.map(({ value, label, description }) => (
          <label
            className="v98-scheme-choice"
            data-scheme={value}
            data-selected={choice === value}
            key={value}
          >
            <input
              type="radio"
              name="desktop-theme"
              aria-label={label}
              value={value}
              checked={choice === value}
              onChange={() => choose(value)}
            />
            <span className="v98-scheme-preview" aria-hidden>
              <span className="v98-scheme-caption" />
              <span className="v98-scheme-paper" />
              <i />
            </span>
            <span className="v98-scheme-name">{label}</span>
            <small>{description}</small>
          </label>
        ))}
      </RetroFieldset>
      <p className="v98-muted">Mail appearance is also available in Settings.</p>
    </div>
  );
}
