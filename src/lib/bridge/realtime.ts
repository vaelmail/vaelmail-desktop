import { call } from "./invoke";

export type SubscriptionQuery = { key: string; path: string; pages?: number };

export const realtime = {
  subscribe: (queries: SubscriptionQuery[]) => call<void>("realtime_subscribe", { queries }),
  reconnect: () => call<void>("realtime_reconnect"),
};
