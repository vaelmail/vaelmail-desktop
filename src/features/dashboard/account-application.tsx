import { useQuery } from "@tanstack/react-query";
import { useMail } from "@/features/mailbox/context";
import type { AccountSnapshot } from "@/lib/account";
import { Failure, Skeleton } from "@/ui/controls";
import { useWindow } from "@/shell/window-context";
import { Dashboard } from "./dashboard";

export function AccountApplication() {
  const { data, request } = useMail();
  const { href } = useWindow();
  const query = useQuery({
    queryKey: ["account", data.mailbox.id, data.mailbox.generation],
    queryFn: () => request<AccountSnapshot>("/api/account"),
  });

  if (!query.data) {
    return query.error ? (
      <Failure error={query.error} retry={() => void query.refetch()} />
    ) : (
      <Skeleton variant="panel" />
    );
  }
  return <Dashboard location={href} initial={query.data} />;
}
