import type { MailItem, Service } from "./types";

export class MailArrivals {
  private previous?: { total: number; ids: Set<string> };
  reconcile(total: number, items: MailItem[], services: Service[]): number {
    const ids = new Set(items.map((item) => item.messageId || item.id));
    const previous = this.previous;
    this.previous = { total, ids };
    if (!previous || total <= previous.total) return 0;
    return Math.min(
      total - previous.total,
      items.filter(
        (item) =>
          !previous.ids.has(item.messageId || item.id) &&
          item.unread &&
          !services.some(
            (service) =>
              service.muted &&
              (service.id === item.serviceId ||
                service.senderDomains.includes(item.senderDomain || "")),
          ),
      ).length,
    );
  }
}
