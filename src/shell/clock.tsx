import { useState, useSyncExternalStore } from "react";
import { Popover } from "@base-ui/react/popover";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { RetroButton, RetroSurface } from "@/ui/retro98";
import { useTheme } from "@/lib/theme";

const minuteMs = 60_000;

function Calendar({ now }: { now: Date }) {
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const firstDay = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((firstDay + days) / 7);
  const shift = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="v98-calendar">
      <div className="v98-calendar-today">
        <span>{now.toLocaleDateString(undefined, { weekday: "long" })}</span>
        <strong>{now.toLocaleDateString(undefined, { day: "numeric", month: "long" })}</strong>
      </div>
      <div className="v98-calendar-heading">
        <RetroButton aria-label="Previous month" onClick={() => shift(-1)}>
          <CaretLeftIcon size={16} aria-hidden />
        </RetroButton>
        <h3 aria-live="polite">{monthLabel}</h3>
        <RetroButton aria-label="Next month" onClick={() => shift(1)}>
          <CaretRightIcon size={16} aria-hidden />
        </RetroButton>
      </div>
      <table aria-label={monthLabel}>
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, index) => {
              const day = new Date(2026, 0, 4 + index);
              return (
                <th
                  scope="col"
                  key={index}
                  abbr={day.toLocaleDateString(undefined, { weekday: "long" })}
                >
                  {day.toLocaleDateString(undefined, { weekday: "narrow" })}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: weeks }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, weekday) => {
                const day = week * 7 + weekday - firstDay + 1;
                const today =
                  day === now.getDate() &&
                  month.getMonth() === now.getMonth() &&
                  month.getFullYear() === now.getFullYear();
                return (
                  <td key={weekday} data-today={today} aria-current={today ? "date" : undefined}>
                    {day > 0 && day <= days ? day : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="v98-calendar-footer">
        <RetroButton onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>
          Today
        </RetroButton>
        <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
      </div>
    </div>
  );
}

function subscribeMinute(notify: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    clearTimeout(timer);
    if (document.hidden) return;
    notify();
    timer = setTimeout(tick, minuteMs - (Date.now() % minuteMs) + 20);
  };
  document.addEventListener("visibilitychange", tick);
  tick();
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}

export function TrayClock() {
  const resolved = useTheme((state) => state.resolved);
  const minute = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / minuteMs));
  const date = new Date(minute * minuteMs);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const label = date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });

  return (
    <Popover.Root>
      <Popover.Trigger
        className="v98-clock-button"
        aria-label={`${time}, open calendar`}
        title={label}
      >
        <time className="v98-tray-clock" dateTime={date.toISOString()}>
          {time}
        </time>
      </Popover.Trigger>
      <Popover.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Popover.Positioner side="top" align="end" sideOffset={9} className="v98-menu-positioner">
            <Popover.Popup className="v98-calendar-popup" aria-label="Calendar">
              <Calendar now={date} />
            </Popover.Popup>
          </Popover.Positioner>
        </RetroSurface>
      </Popover.Portal>
    </Popover.Root>
  );
}
