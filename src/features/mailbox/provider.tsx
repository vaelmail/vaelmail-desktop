import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Tooltip } from "@base-ui/react/tooltip";
import { toast } from "sonner";
import { BootScreen } from "@/app/boot";
import { api, ApiError, bridge, on } from "@/lib/bridge";
import { useConnection } from "@/features/connection/store";
import { encryptionStatus } from "@/lib/encryption/api";
import { useTheme } from "@/lib/theme";
import { SettingsWriter, type SaveSnapshot } from "@/lib/mail/settings-writer";
import type { Bootstrap, Draft, Settings } from "@/lib/mail/types";
import { openLocation, useDesktop } from "@/shell/store";
import { useActivityPing } from "./activity";
import { MailContext } from "./context";
import { ScrollPositionsProvider } from "@/features/mail/scroll-positions";
import { MailboxUnlock } from "@/features/mail/mailbox-unlock";
import { useNativeEvents } from "./native-events";
import { hydrate, startPersistence } from "./persistence";
import { applySnapshot, type MailboxSnapshot } from "./snapshot";
import { useMailSubscriptions } from "./subscriptions";

const invalidated = ["bootstrap", "mail", "thread", "jobs", "account", "services"];

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        networkMode: "offlineFirst",
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
      },
      mutations: { retry: false, networkMode: "online" },
    },
  });
}

export function MailboxProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createClient);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hydrate(client).then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    const online = on("network:online", (value) => {
      onlineManager.setOnline(value);
      useConnection.getState().setOnline(value);
    });
    const status = on("realtime:status", (value) => useConnection.getState().setStatus(value));
    return () => {
      void online.then((unlisten) => unlisten());
      void status.then((unlisten) => unlisten());
    };
  }, []);

  if (!hydrated) return <BootScreen />;

  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider delay={500}>
        <MailboxGate>{children}</MailboxGate>
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}

function NativeEvents() {
  useNativeEvents();
  return null;
}

function broadcast(mailboxId: string) {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel("vael-mail-" + mailboxId);
  channel.postMessage({ changed: true });
  channel.close();
}

function MailboxGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const setTheme = useTheme((state) => state.setChoice);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saveSnapshot, setSaveSnapshot] = useState<SaveSnapshot & { scope?: string }>({
    status: "idle",
    values: {},
  });
  const refreshTask = useRef<Promise<void> | undefined>(undefined);
  const generation = useRef<number | undefined>(undefined);

  const query = useQuery({
    queryKey: ["bootstrap"],
    queryFn: ({ signal }) => api<Bootstrap>("bootstrap", "GET", undefined, undefined, signal),
    refetchInterval: (state) =>
      state.state.data?.filtering?.pending && !state.state.data.filtering.error ? 2000 : false,
  });
  const data = query.data;
  const mailboxId = data?.mailbox.id;
  const mailboxGeneration = data?.mailbox.generation;
  const saveScope = `${mailboxId}:${mailboxGeneration}`;

  const writer = useMemo(
    () =>
      new SettingsWriter(
        async (patch) => {
          await client.cancelQueries({ queryKey: ["bootstrap"] });
          const settings = await api<Settings>("settings", "PATCH", patch, mailboxGeneration);
          client.setQueryData<Bootstrap>(["bootstrap"], (old) => {
            if (!old) return old;
            const same =
              old.mailbox.id === mailboxId && old.mailbox.generation === mailboxGeneration;
            return same ? { ...old, mailbox: { ...old.mailbox, settings } } : old;
          });
          if (
            "stripTrackingLinks" in patch ||
            "blockTrackingPixels" in patch ||
            "warnSuspiciousLinks" in patch
          ) {
            await client.invalidateQueries({ queryKey: ["thread"] });
          }
          if (mailboxId) broadcast(mailboxId);
          return settings;
        },
        (snapshot) => setSaveSnapshot({ ...snapshot, scope: saveScope }),
      ),
    [client, mailboxId, mailboxGeneration, saveScope],
  );

  const settingsSave: SaveSnapshot =
    saveSnapshot.scope === saveScope ? saveSnapshot : { status: "idle", values: {} };
  const theme = settingsSave.values.theme ?? data?.mailbox.settings.theme;

  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);

  useEffect(() => {
    if (!mailboxId || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("vael-mail-" + mailboxId);
    channel.onmessage = () => void client.invalidateQueries();
    return () => channel.close();
  }, [mailboxId, client]);

  useEffect(() => {
    if (!mailboxId || mailboxGeneration === undefined) return;
    if (generation.current !== undefined && generation.current !== mailboxGeneration) {
      client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== "bootstrap" });
      void bridge.recovery.clear();
      toast.info("mailbox refreshed");
    }
    generation.current = mailboxGeneration;
  }, [mailboxId, mailboxGeneration, client]);

  useEffect(() => {
    if (!mailboxId) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const encrypted = await encryptionStatus()
        .then((status) => !!status && status.state !== "off")
        .catch(() => false);
      const opened = await bridge.cache.open(mailboxId, encrypted).catch(() => false);
      if (opened && !cancelled) stop = startPersistence(client);
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [mailboxId, client]);

  useMailSubscriptions(!!mailboxId);
  useActivityPing(mailboxGeneration ?? 0);

  const refresh = useCallback(() => {
    if (refreshTask.current) return refreshTask.current;
    setRefreshing(true);
    const task = (async () => {
      await api("sync");
      await client.invalidateQueries(undefined, { throwOnError: true });
      setLastSync(Date.now());
    })().finally(() => {
      refreshTask.current = undefined;
      setRefreshing(false);
    });
    refreshTask.current = task;
    return task;
  }, [client]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reconcile = (scopes?: string[]) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const everything = !scopes || scopes.includes("mail") || scopes.includes("thread");
        if (everything) await api("sync").catch(() => undefined);
        await client.invalidateQueries({
          predicate: (entry) => (scopes ?? invalidated).includes(String(entry.queryKey[0])),
        });
        setLastSync(Date.now());
      }, 250);
    };
    const refreshing = on("realtime:refresh", (payload) => reconcile(payload.scopes));
    const snapshot = on("realtime:snapshot", (payload) => {
      if (applySnapshot(client, payload as MailboxSnapshot)) setLastSync(Date.now());
    });
    return () => {
      clearTimeout(timer);
      void refreshing.then((unlisten) => unlisten());
      void snapshot.then((unlisten) => unlisten());
    };
  }, [client]);

  useEffect(() => {
    const arrived = on("mail:arrived", () => {
      if (!client.getQueryData<Bootstrap>(["bootstrap"])?.mailbox.settings.inAppNotifications)
        return;
      const { dispatch, windows, active } = useDesktop.getState();
      openLocation({ appId: "mail", href: "/webmail/inbox" }, true);
      if (
        active !== "mail" ||
        windows.find((window) => window.id === "mail")?.mode === "minimized"
      ) {
        dispatch({ type: "notification", id: "mail", unread: true });
      }
    });
    return () => void arrived.then((unlisten) => unlisten());
  }, [client]);

  if (query.isPending) return <BootScreen />;
  if (!data) {
    return (
      <div className="vd-loading" role="alert">
        <p>{query.error?.message ?? "could not load your mailbox."}</p>
        <button type="button" className="v98-button" onClick={() => void query.refetch()}>
          try again
        </button>
      </div>
    );
  }

  const merged: Bootstrap = {
    ...data,
    mailbox: {
      ...data.mailbox,
      settings: { ...data.mailbox.settings, ...settingsSave.values },
    },
  };

  const request = async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    try {
      const result = await api<T>(path, method, body, merged.mailbox.generation);
      if (method !== "GET") broadcast(merged.mailbox.id);
      return result;
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        ["session_expired", "mailbox_reset"].includes(failure.detail.code)
      ) {
        await client.invalidateQueries({ queryKey: ["bootstrap"] });
      }
      throw failure;
    }
  };

  const compose = async (initial?: Partial<Draft>) => {
    try {
      const payload = {
        ...(merged.mailbox.settings.plainText && initial?.plain === undefined
          ? { plain: true }
          : {}),
        ...initial,
      };
      const draft = await request<Draft>("drafts", "POST", payload);
      openLocation({ appId: "compose", href: "/webmail/compose", instanceId: draft.id });
      await refresh();
    } catch (failure) {
      toast.error((failure as Error).message);
    }
  };

  return (
    <MailContext.Provider
      value={{
        data: merged,
        refreshing,
        lastSync,
        refresh,
        request,
        compose,
        setSettings: (patch) => writer.patch(patch),
        settingsSave,
        retrySettings: () => writer.retry(),
      }}
    >
      <ScrollPositionsProvider key={`${merged.mailbox.id}:${merged.mailbox.generation}`}>
        {children}
        <NativeEvents />
        <MailboxUnlock />
      </ScrollPositionsProvider>
    </MailContext.Provider>
  );
}
