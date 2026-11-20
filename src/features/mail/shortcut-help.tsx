import { shortcutGroups } from "@/lib/mail/shortcuts";

export function ShortcutHelp() {
  return (
    <div className="wm-shortcut-help">
      {shortcutGroups.map((group) => (
        <section key={group.title} aria-label={group.title + " shortcuts"}>
          <h3 className="wm-nav-label">{group.title}</h3>
          <div className="wm-shortcut-list">
            {group.items.map((item) => (
              <div key={item.display + item.label}>
                <span>{item.label}</span>
                <kbd>{item.display}</kbd>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
