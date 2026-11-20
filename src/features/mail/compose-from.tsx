import { VaelSelect } from "@/ui/select";
import type { Identity } from "@/lib/mail/types";

export function ComposeFrom({
  id,
  identities,
  value,
  onChange,
}: {
  id: string;
  identities: Identity[];
  value: string;
  onChange: (identityId: string) => void;
}) {
  const known = identities.some((i) => i.id === value);
  return (
    <>
      <label htmlFor={id}>from</label>
      <VaelSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {!known && value && (
          <option value={value} disabled>
            address no longer available
          </option>
        )}
        {identities.map((i) => (
          <option key={i.id} value={i.id}>
            {(i.name ? i.name + " · " : "") + i.email}
          </option>
        ))}
      </VaelSelect>
    </>
  );
}
