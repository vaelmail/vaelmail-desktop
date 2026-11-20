import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/bridge";
import type { Conversation, MailFilter, MailList } from "./types";
export const mailScope = (id: string, generation: number) => [id, generation] as const;
export const defaultFilter = (view: string, sort: MailFilter["sort"]): MailFilter => ({
  view,
  sort,
  query: "",
  unread: false,
  starred: false,
  attachment: false,
});
export function mailPath(filter: MailFilter, pageParam?: string) {
  const p = new URLSearchParams({
    view: filter.view,
    query: filter.query,
    sort: filter.sort,
    unread: String(filter.unread),
    starred: String(filter.starred),
    attachment: String(filter.attachment),
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.service ? { service: filter.service } : {}),
    ...(pageParam ? { cursor: pageParam } : {}),
  });
  return "mail?" + p;
}
export function mailOptions(scope: readonly [string, number], filter: MailFilter) {
  return infiniteQueryOptions({
    queryKey: ["mail", ...scope, filter],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      return api<MailList>(mailPath(filter, pageParam), "GET", undefined, undefined, signal);
    },
    getNextPageParam: (last: MailList) => last.nextCursor || undefined,
    maxPages: 10,
  });
}
export function threadOptions(scope: readonly [string, number], id: string, speculative = false) {
  return queryOptions({
    queryKey: ["thread", ...scope, id],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      api<Conversation>(
        "threads/" + id + (speculative ? "?prefetch=1" : ""),
        "GET",
        undefined,
        undefined,
        signal,
      ),
  });
}
