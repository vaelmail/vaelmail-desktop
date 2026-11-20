import { useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { XIcon } from "@phosphor-icons/react";
import type { Recipient } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";

export function RecipientField({
  name,
  value,
  onChange,
  invalid,
  setInvalid,
}: {
  name: string;
  value: Recipient[];
  onChange: (value: Recipient[]) => void;
  invalid: boolean;
  setInvalid: (invalid: boolean) => void;
}) {
  const { data } = useMail(),
    [text, setText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const suggestions = data.resources.contacts.flatMap((c) =>
    c.emails
      .filter((email) => !value.some((r) => r.email === email))
      .map((email) => (c.name ? c.name + " <" + email + ">" : email)),
  );
  const commit = (raw = text) => {
    if (!raw.trim()) return true;
    const parts = raw
      .split(/[;,\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const mapped = parts.map((x) => {
      const m = x.match(/^(.*?)\s*<([^>]+)>$/);
      return {
        email: (m ? (m[2] ?? "") : x).toLowerCase(),
        ...(m?.[1] ? { name: m[1].replace(/^"|"$/g, "") } : {}),
      };
    });
    if (mapped.some((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))) {
      setInvalid(true);
      setAttempted(true);
      return false;
    }
    const all = [...value, ...mapped].filter(
      (r, i, a) => a.findIndex((x) => x.email === r.email) === i,
    );
    if (all.length > 100) {
      setInvalid(true);
      setAttempted(true);
      return false;
    }
    onChange(all);
    setText("");
    setInvalid(false);
    setAttempted(false);
    return true;
  };
  return (
    <div className="wm-recipient-row">
      <label htmlFor={"recipient-" + name}>{name.split("-")[0]}</label>
      <div className="wm-recipient-input">
        {value.map((r, i) => (
          <span className="wm-recipient-chip" key={r.email} title={r.email}>
            {r.name || r.email}
            <button
              type="button"
              aria-label={"remove " + r.email}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <XIcon size={12} />
            </button>
          </span>
        ))}
        <Autocomplete.Root
          items={suggestions}
          value={text}
          onValueChange={(next, details) => {
            if (details.reason === "item-press") {
              commit(next);
            } else {
              setText(next);
              setInvalid(!!next);
              setAttempted(false);
            }
          }}
        >
          <Autocomplete.Input
            id={"recipient-" + name}
            aria-invalid={invalid && attempted}
            aria-describedby={invalid && attempted ? "recipient-error-" + name : undefined}
            placeholder={value.length ? "add another" : "name or email address"}
            onBlur={(event) => {
              if (!(event.relatedTarget as HTMLElement)?.closest(".wm-recipient-suggestions"))
                commit();
            }}
            onPaste={(e) => {
              const raw = e.clipboardData.getData("text");
              if (/[;,\n]/.test(raw)) {
                e.preventDefault();
                commit(raw);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.getAttribute("aria-activedescendant"))
                return;
              if (["Enter", ",", ";", "Tab"].includes(e.key) && text) {
                if (e.key !== "Tab") e.preventDefault();
                commit();
              }
              if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
            }}
          />
          <Autocomplete.Portal>
            <Autocomplete.Positioner sideOffset={6}>
              <Autocomplete.Popup className="wm-recipient-suggestions">
                <Autocomplete.List>
                  {(item: string) => (
                    <Autocomplete.Item key={item} value={item}>
                      <strong>{item.includes("<") ? item.split(" <")[0] : item}</strong>
                      {item.includes("<") && (
                        <small>{(item.split("<")[1] ?? "").replace(">", "")}</small>
                      )}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.List>
                <Autocomplete.Empty>
                  no matching contacts. enter an email address.
                </Autocomplete.Empty>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
        {invalid && attempted && text && (
          <span id={"recipient-error-" + name} className="wm-field-error">
            complete a valid email address, then press enter
          </span>
        )}
      </div>
    </div>
  );
}
