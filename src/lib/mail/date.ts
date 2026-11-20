import { format, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
export function mailDate(value: string, pattern: string, timezone: string) {
  return format(new TZDate(value, timezone), pattern);
}

export function mailPeriod(value: string, timezone: string, now = new Date()) {
  const date = new TZDate(value, timezone),
    today = new TZDate(now, timezone);
  if (!Number.isFinite(date.getTime())) return "Older";
  if (format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")) return "Today";
  if (date >= startOfWeek(today, { weekStartsOn: 1 })) return "This Week";
  if (format(date, "yyyy-MM") === format(today, "yyyy-MM")) return "This Month";
  return "Older";
}
