export function threadIds(items: readonly { threadId: string | null }[]) {
  const seen = new Set<string>(),
    ids: string[] = [];
  for (const item of items)
    if (item.threadId && !seen.has(item.threadId)) {
      seen.add(item.threadId);
      ids.push(item.threadId);
    }
  return ids;
}

export function applySelection(
  current: readonly string[],
  ordered: readonly string[],
  target: string,
  checked: boolean,
  anchor: string | null,
  range: boolean,
): string[] {
  const to = ordered.indexOf(target),
    from = anchor ? ordered.indexOf(anchor) : -1;
  const span =
    range && from >= 0 && to >= 0
      ? ordered.slice(Math.min(from, to), Math.max(from, to) + 1)
      : [target];
  if (checked) return [...new Set([...current, ...span])];
  const remove = new Set(span);
  return current.filter((id) => !remove.has(id));
}

export function pruneSelection(current: string[], present: readonly string[]): string[] {
  if (!current.length) return current;
  const available = new Set(present),
    next = current.filter((id) => available.has(id));
  return next.length === current.length ? current : next;
}

export function selectionState(
  selected: readonly string[],
  ordered: readonly string[],
): "none" | "some" | "all" {
  if (!selected.length || !ordered.length) return "none";
  const chosen = new Set(selected);
  return ordered.every((id) => chosen.has(id)) ? "all" : "some";
}

export function adjacentThread(
  ordered: readonly string[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (!ordered.length) return null;
  const index = current ? ordered.indexOf(current) : -1;
  if (index < 0) return ordered[0] ?? null;
  return ordered[index + direction] ?? null;
}
