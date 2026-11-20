import { useState, type ComponentType } from "react";
import { DesktopIcon } from "@phosphor-icons/react";
import { NetworkSection } from "./network";
import { NotificationsSection } from "./notifications";
import { OfflineCacheSection } from "./offline-cache";
import { MailHandlerSection } from "./mail-handler";
import { StartupSection } from "./startup";
import { UpdatesSection } from "./updates";

const sections: {
  id: string;
  label: string;
  title: string;
  description: string;
  Component: ComponentType;
}[] = [
  {
    id: "notifications",
    label: "notifications",
    title: "notifications",
    description: "how VaelMail alerts you about new mail.",
    Component: NotificationsSection,
  },
  {
    id: "startup",
    label: "tray & startup",
    title: "tray & startup",
    description: "what happens when you close the window or sign in to your computer.",
    Component: StartupSection,
  },
  {
    id: "updates",
    label: "updates",
    title: "updates",
    description: "keep VaelMail current.",
    Component: UpdatesSection,
  },
  {
    id: "cache",
    label: "offline cache",
    title: "offline cache",
    description: "saved mail for instant starts and offline reading.",
    Component: OfflineCacheSection,
  },
  {
    id: "network",
    label: "network",
    title: "network",
    description: "how VaelMail connects to the service.",
    Component: NetworkSection,
  },
  {
    id: "handler",
    label: "mail handler",
    title: "mail handler",
    description: "open email links in VaelMail.",
    Component: MailHandlerSection,
  },
];

export default function DesktopSettingsApp() {
  const [current, setCurrent] = useState(sections[0]!.id);
  const active = sections.find((section) => section.id === current) ?? sections[0]!;
  const { Component } = active;

  return (
    <div className="wm v98-resource-app">
      <div className="wm-settings" data-settings-page={active.id}>
        <aside className="wm-settings-nav" aria-label="desktop settings navigation">
          <div>
            <DesktopIcon size={22} />
            <h1>desktop</h1>
          </div>
          <nav aria-label="desktop settings categories">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={section.id === current ? "active" : ""}
                onClick={(event) => {
                  event.preventDefault();
                  setCurrent(section.id);
                }}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>
        <section className="wm-settings-content">
          <div className="wm-page-heading">
            <div>
              <h1>{active.title}</h1>
              <p className="wm-muted">{active.description}</p>
            </div>
          </div>
          <div className="wm-settings-body">
            <Component />
          </div>
        </section>
      </div>
    </div>
  );
}
