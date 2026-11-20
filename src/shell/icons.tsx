import {
  AddressBookIcon,
  BuildingsIcon,
  CreditCardIcon,
  DesktopTowerIcon,
  EnvelopeIcon,
  GearSixIcon,
  GlobeIcon,
  HardDrivesIcon,
  InfoIcon,
  KeyIcon,
  PaletteIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  TagIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import type { AppIconName } from "@/lib/desktop/registry";

const icons = {
  mail: EnvelopeIcon,
  compose: PencilSimpleIcon,
  contacts: AddressBookIcon,
  services: BuildingsIcon,
  aliases: TagIcon,
  settings: GearSixIcon,
  person: UserCircleIcon,
  shield: ShieldCheckIcon,
  key: KeyIcon,
  billing: CreditCardIcon,
  data: HardDrivesIcon,
  domains: GlobeIcon,
  appearance: PaletteIcon,
  desktop: DesktopTowerIcon,
  about: InfoIcon,
} satisfies Record<AppIconName, unknown>;

export function AppIcon({ icon, size = 20 }: { icon: AppIconName; size?: number }) {
  const Icon = icons[icon];
  return <Icon className="v98-app-icon" weight="duotone" size={size} aria-hidden />;
}
