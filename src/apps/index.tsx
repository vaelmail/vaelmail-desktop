import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { AppId } from "@/lib/desktop/registry";

const load = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);

export const appComponents: Record<AppId, LazyExoticComponent<ComponentType>> = {
  mail: load(() => import("./mail")),
  compose: load(() => import("./compose")),
  contacts: load(() => import("./contacts")),
  aliases: load(() => import("./aliases")),
  services: load(() => import("./services")),
  settings: load(() => import("./settings")),
  account: load(() => import("./account")),
  domains: load(() => import("./domains")),
  security: load(() => import("./security")),
  billing: load(() => import("./billing")),
  data: load(() => import("./data")),
  appearance: load(() => import("./appearance")),
  "desktop-settings": load(() => import("./desktop-settings")),
  about: load(() => import("./about")),
};
