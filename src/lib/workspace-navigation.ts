const savers = new Map<string, () => Promise<unknown>>();
export function registerDraftSaver(id: string, save: () => Promise<unknown>) {
  savers.set(id, save);
  return () => {
    savers.delete(id);
  };
}
export async function saveOpenDrafts() {
  await Promise.all([...savers.values()].map((save) => save()));
}
export const accountDestinations: Record<string, string> = {
  aliases: "/dashboard/addresses",
  "settings/addresses": "/dashboard/addresses",
  "settings/storage": "/dashboard/storage",
  "settings/session": "/dashboard/security",
};
