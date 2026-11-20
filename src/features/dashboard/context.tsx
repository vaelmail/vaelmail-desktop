import { createContext, useContext } from "react";
import type { AccountActionResult, AccountSnapshot } from "@/lib/account";
type AccountContextValue = {
  account: AccountSnapshot;
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<AccountActionResult>;
};
export const AccountContext = createContext<AccountContextValue | null>(null);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("missing account");
  return value;
}
export const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
        .format(new Date(value))
        .toLowerCase()
    : "none";
export const money = (value: number) => `€${Number.isInteger(value) ? value : value.toFixed(2)}`;
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
