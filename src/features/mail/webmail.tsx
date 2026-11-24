import { useEffect, useMemo, useRef, useState } from "react";
import { navigateMail } from "@/ui/controls";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { ScrollMail } from "./scroll-mail";
import { mailActions } from "./mail-actions";
import { mailPeriod } from "@/lib/mail/date";
import { MailRow } from "./mail-row";
import { reportMailboxLocked } from "@/lib/encryption/lock-state";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  XIcon,
  DotsThreeIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  SidebarSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Brand } from "@/shell/brand";
import { accountDestinations } from "@/lib/workspace-navigation";
import { useConnection, connectionLabel } from "@/features/connection/store";
import { navigateWindow, openHref, useDesktop } from "@/shell/store";
import { remainingTime } from "@/lib/mail/client";
import { useWorkspace } from "@/features/mail/workspace";
import {
  type ActionResult,
  type MailAction,
  type MailFilter,
  type MailItem,
  type Job,
  type MailCategory,
} from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { mailOptions, mailScope, threadOptions } from "@/lib/mail/queries";
import { createShortcutMatcher, goDestinations, type ShortcutCommand } from "@/lib/mail/shortcuts";
import {
  adjacentThread,
  applySelection,
  pruneSelection,
  selectionState,
  threadIds,
} from "@/lib/mail/selection";
import { splitAdvancedSearch } from "@/lib/mail/search";
import { Button, Dropdown, Empty, Failure, IconButton, Sheet, Skeleton } from "@/ui/controls";
import { Reader, type ReaderCommands } from "./reader";
import { CommandMenu } from "./command-menu";
import { MailNavigation } from "./mail-navigation";
import {
  useElementWide,
  useMailKeyboard,
  useOnline,
  useRememberPreviousView,
} from "./use-mail-shell";
import {
  ActionModal,
  AdvancedSearchModal,
  JobModal,
  ShortcutsModal,
  type JobModalState,
  type ActionModalKind,
} from "./mail-dialogs";
import { useMailboxCollapse, useWide } from "./device-layout";
import { mailContentKey, transitionMail, useMailMotion } from "./mail-motion";
export function MailApplication({
  location,
  desktop = false,
}: {
  location: string;
  desktop?: boolean;
}) {
  const { data, compose, request, refresh, refreshing } = useMail();
  const connection = useConnection();
  const localURL = useMemo(() => new URL(location, "https://desktop.invalid"), [location]);
  const pathname = localURL.pathname,
    search = localURL.searchParams;
  const applicationActive = useDesktop((state) => state.active === "mail");
  const currentLocation = () =>
    useDesktop.getState().windows.find((window) => window.id === "mail")?.href ?? location;
  const view = pathname.replace(/^\/webmail\/?/, "") || "inbox",
    threadId = search.get("thread"),
    viewportWide = useWide();
  const root = useRef<HTMLDivElement>(null);
  const windowWide = useElementWide(root, desktop);
  const wide = desktop ? windowWide : viewportWide;
  const online = useOnline();
  const motionLocation = mailContentKey(pathname + "?" + search.toString());
  useMailMotion(data.mailbox.id + ":" + data.mailbox.generation, motionLocation);
  const [collapsed, toggleCollapse] = useMailboxCollapse(data.mailbox.id);
  const [nav, setNav] = useState(false),
    [query, setQuery] = useState(search.get("q") || ""),
    [advanced, setAdvanced] = useState(false);
  const flags = {
    unread: search.get("unread") === "true",
    starred: search.get("starred") === "true",
    attachment: search.get("attachment") === "true",
  };
  const category = ["codes", "receipts", "newsletters", "security"].includes(
    search.get("category") || "",
  )
    ? (search.get("category") as MailCategory)
    : undefined;
  const updateFilter = (key: string, value?: string) => {
    const url = new URL(location, "https://desktop.invalid");
    if (
      key === "q" &&
      (view.startsWith("settings") || ["contacts", "aliases", "services"].includes(view))
    ) {
      url.pathname = "/webmail/search";
      url.search = "";
    }
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    url.searchParams.delete("thread");
    transitionMail(url.href, () => {
      void navigateWindow("mail", url.pathname + url.search);
      setSelection([]);
      setAllMatching(false);
    });
  };
  const [selection, setSelection] = useState<string[]>([]),
    [allMatching, setAllMatching] = useState(false),
    [actionModal, setActionModal] = useState<ActionModalKind | null>(null);
  const [readerCommands, setReaderCommands] = useState<ReaderCommands | null>(null);
  const [jobModal, setJobModal] = useState<JobModalState | null>(null);
  useEffect(() => {
    setSelection([]);
    setAllMatching(false);
    setQuery(new URL(location, "https://desktop.invalid").searchParams.get("q") || "");
  }, [location]);
  const [snoozeTime, setSnoozeTime] = useState(""),
    [busy, setBusy] = useState(false),
    [searchFields, setSearchFields] = useState(() => splitAdvancedSearch("").fields),
    [searchText, setSearchText] = useState(""),
    [help, setHelp] = useState(false),
    [shortcutMatcher] = useState(createShortcutMatcher),
    selectionAnchor = useRef<string | null>(null);
  const settings = view.startsWith("settings"),
    resourceView = ["contacts", "aliases", "services"].includes(view);
  const queryInput = useRef<HTMLInputElement>(null);
  useRememberPreviousView(data.mailbox.id, settings, pathname, search);
  const paneLayout = useDefaultLayout({
    id: "vael-mail-layout:" + data.mailbox.id,
    panelIds: ["list", "reader"],
    onlySaveAfterUserInteractions: true,
  });
  const scope = mailScope(data.mailbox.id, data.mailbox.generation);
  const queryClient = useQueryClient();
  const filter: MailFilter = {
    view,
    query: search.get("q") || "",
    ...flags,
    sort:
      search.get("sort") === "oldest"
        ? "oldest"
        : search.get("sort") === "newest"
          ? "newest"
          : data.mailbox.settings.sort,
    category,
    service: search.get("service") || undefined,
  };
  const mail = useInfiniteQuery({
    ...mailOptions(scope, filter),
    enabled: !settings && !resourceView && applicationActive,
  });
  const items = useMemo(() => mail.data?.pages.flatMap((p) => p.items) || [], [mail.data]),
    total = mail.data?.pages[0]?.total || 0;
  const listedThreads = useMemo(() => threadIds(items), [items]),
    allState = selectionState(selection, listedThreads);
  const hasLockedRows = items.some((item) => item.locked);
  useEffect(() => {
    if (hasLockedRows) reportMailboxLocked();
  }, [hasLockedRows]);
  useEffect(() => {
    if (actionModal || jobModal || mail.isPending) return;
    setSelection((current) => pruneSelection(current, listedThreads));
  }, [listedThreads, actionModal, jobModal, mail.isPending]);
  const chooseThread = (id: string | null) => {
    if (id) void queryClient.prefetchQuery(threadOptions(scope, id));
    const url = new URL(location, "https://desktop.invalid");
    if (id) url.searchParams.set("thread", id);
    else url.searchParams.delete("thread");
    transitionMail(url.href, () => {
      void navigateWindow("mail", url.pathname + url.search);
    });
  };
  const clearSelection = () => {
    setSelection([]);
    setAllMatching(false);
  };
  const go = (destination: string) => {
    const account =
      accountDestinations[destination] ||
      (destination.startsWith("/dashboard") ? destination : undefined);
    if (account) {
      setNav(false);
      void openHref(account);
      return;
    }
    navigateMail("/webmail/" + destination);
    setNav(false);
    setSelection([]);
    setAllMatching(false);
    setQuery("");
  };
  const title =
    data.resources.folders.find((f) => view === "folders/" + f.id)?.name ||
    data.resources.labels.find((f) => view === "labels/" + f.id)?.name ||
    data.resources.aliases.find((f) => view === "aliases/" + f.id)?.address ||
    (view === "all" ? "all mail" : view === "search" ? "search results" : view.split("/")[0]);
  const runAction = async (type: MailAction["type"], value?: string, ids = selection) => {
    const actionLocation = currentLocation();
    setBusy(true);
    try {
      const result = await request<ActionResult>("actions", "POST", {
        type,
        value,
        ids,
        ...(filter.service || filter.category ? { filter } : {}),
        ...(allMatching && ids === selection ? { allMatching: true, filter } : {}),
      });
      await refresh();
      setSelection([]);
      setAllMatching(false);
      setActionModal(null);
      if (
        ["archive", "trash", "spam", "move", "snooze", "delete"].includes(type) &&
        threadId &&
        ids.includes(threadId) &&
        actionLocation === currentLocation()
      ) {
        const next = items.find((i) => i.threadId && !ids.includes(i.threadId));
        chooseThread(data.mailbox.settings.afterAction === "next" ? next?.threadId || null : null);
      }
      toast.success(
        result.count + (result.count === 1 ? " conversation updated" : " conversations updated"),
        result.undoId
          ? {
              duration: remainingTime(result.expiresAt!),
              action: {
                label: "undo",
                onClick: () => {
                  void request("undo/" + result.undoId, "POST", {})
                    .then(refresh)
                    .catch((e) => toast.error(e.message));
                },
              },
            }
          : {},
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openItem = (item: MailItem) => {
    if (item.kind === "draft") useWorkspace.getState().openDraft(item.id);
    else if (item.kind === "job") {
      void request<Job[]>("jobs")
        .then((jobs) => {
          const job = jobs.find((j) => j.id === item.id);
          if (job) {
            setSelection([job.id]);
            setJobModal(job);
          }
        })
        .catch((e) => toast.error(e.message));
    } else chooseThread(item.threadId);
  };
  const runShortcut = (command: ShortcutCommand) => {
    const destination = goDestinations[command];
    if (destination) return go(destination);
    const targets = selection.length ? selection : threadId ? [threadId] : [];
    const targeted = items.filter((item) => !!item.threadId && targets.includes(item.threadId));
    switch (command) {
      case "compose":
        return void compose();
      case "search":
        return queryInput.current?.focus();
      case "help":
        return setHelp(true);
      case "palette":
        return useWorkspace.getState().setCommand(true);
      case "back":
        if (threadId) chooseThread(null);
        else {
          setSelection((current) => (current.length ? [] : current));
          setAllMatching(false);
        }
        return;
      case "next":
      case "previous": {
        const next = adjacentThread(listedThreads, threadId, command === "next" ? 1 : -1);
        const item = next && items.find((i) => i.threadId === next);
        if (item) openItem(item);
        return;
      }
      case "reply":
        return readerCommands?.reply();
      case "replyAll":
        return readerCommands?.replyAll();
      case "forward":
        return readerCommands?.forward();
      case "select": {
        if (!threadId || !listedThreads.includes(threadId)) return;
        const checked = !selection.includes(threadId);
        setSelection((current) =>
          applySelection(current, listedThreads, threadId, checked, null, false),
        );
        selectionAnchor.current = threadId;
        setAllMatching(false);
        return;
      }
      case "selectAll":
        setSelection(allState === "all" ? [] : listedThreads);
        setAllMatching(false);
        return;
    }
    if (!targets.length || busy) return;
    const ids = targets;
    if (command === "archive" && view !== "archive") void runAction("archive", undefined, ids);
    else if (command === "trash" && view !== "trash") void runAction("trash", undefined, ids);
    else if (command === "spam" && view !== "spam") void runAction("spam", undefined, ids);
    else if (command === "read" || command === "unread") void runAction(command, undefined, ids);
    else if (command === "star")
      void runAction(
        targeted.length && targeted.every((item) => item.starred) ? "unstar" : "star",
        undefined,
        ids,
      );
  };
  useMailKeyboard({
    active: applicationActive,
    shortcutsEnabled: data.mailbox.settings.shortcuts,
    matcher: shortcutMatcher,
    run: runShortcut,
  });
  const list = (
    <section
      className={"wm-mail-list " + (threadId ? "has-reader" : "")}
      data-mail-view={view.split("/")[0]}
      aria-label={title + " messages"}
    >
      <div className="wm-list-heading">
        <div className="wm-list-title">
          <h1>{title}</h1>
          <span className="wm-muted">
            {total} {view === "drafts" ? "drafts" : "conversations"}
          </span>
        </div>
        <div className="wm-row">
          <IconButton
            label={refreshing ? "refreshing mail" : "refresh mail"}
            disabled={refreshing}
            onClick={() => void refresh().catch(() => toast.error("could not refresh mail"))}
          >
            <ArrowClockwiseIcon size={18} className={refreshing ? "wm-spin" : undefined} />
          </IconButton>
          <Dropdown
            label="list options"
            items={[
              {
                label: filter.sort === "newest" ? "oldest first" : "newest first",
                action: () => void changeSort(),
              },
              {
                label: "manage inbox preferences",
                action: () => go("settings/reading"),
              },
            ]}
          >
            <DotsThreeIcon size={21} />
          </Dropdown>
        </div>
      </div>
      <div className={"wm-list-tools " + (selection.length ? "has-selection" : "")}>
        {desktop ? (
          <Dropdown
            label="Filter messages"
            className="v98-filter-trigger"
            items={[
              ...(["unread", "starred", "attachment"] as const).map((f) => ({
                label: { unread: "Unread", starred: "Starred", attachment: "With attachments" }[f],
                checked: flags[f],
                action: () => updateFilter(f, flags[f] ? undefined : "true"),
              })),
              ...(!["drafts", "scheduled"].includes(view)
                ? (["codes", "receipts", "newsletters", "security"] as const).map((c) => ({
                    label: (c[0] ?? "").toUpperCase() + c.slice(1),
                    checked: category === c,
                    action: () => updateFilter("category", category === c ? undefined : c),
                  }))
                : []),
            ]}
          >
            <FunnelIcon size={16} />
            <span>
              Filter
              {Object.values(flags).filter(Boolean).length + (category ? 1 : 0)
                ? " (" + (Object.values(flags).filter(Boolean).length + (category ? 1 : 0)) + ")"
                : ""}
            </span>
          </Dropdown>
        ) : (
          <div className="wm-filters" aria-label="filter messages">
            {(["unread", "starred", "attachment"] as const).map((f) => (
              <button
                type="button"
                key={f}
                aria-pressed={flags[f]}
                className={flags[f] ? "active" : ""}
                onClick={() => {
                  updateFilter(f, flags[f] ? undefined : "true");
                }}
              >
                {f === "attachment" ? "with files" : f}
              </button>
            ))}
          </div>
        )}
        {!["drafts", "scheduled"].includes(view) && (
          <div className="wm-selectbar">
            <input
              type="checkbox"
              aria-label="select loaded conversations"
              checked={allState === "all"}
              ref={(input) => {
                if (input) input.indeterminate = allState === "some";
              }}
              onChange={() => {
                setSelection(allState === "none" ? listedThreads : []);
                selectionAnchor.current = null;
                setAllMatching(false);
              }}
            />
            <span>
              {selection.length ? (allMatching ? total : selection.length) + " selected" : "all"}
            </span>
            {selection.length > 0 && (
              <>
                <IconButton
                  label="archive selected"
                  disabled={busy}
                  onClick={() => void runAction("archive")}
                >
                  <ArchiveIcon size={17} />
                </IconButton>
                <IconButton
                  label="delete selected"
                  disabled={busy}
                  onClick={() => void runAction("trash")}
                >
                  <TrashIcon size={17} />
                </IconButton>
                <Dropdown
                  label="selection actions"
                  items={mailActions({
                    items: items.filter(
                      (item) => !!item.threadId && selection.includes(item.threadId),
                    ),
                    view,
                    busy,
                    run: (type) => void runAction(type),
                    organize: setActionModal,
                  })}
                >
                  <DotsThreeIcon size={20} />
                </Dropdown>
              </>
            )}
          </div>
        )}
      </div>
      {!desktop && !["drafts", "scheduled"].includes(view) && (
        <div className="wm-smart-filters" aria-label="smart mail filters">
          {(["codes", "receipts", "newsletters", "security"] as const).map((c) => (
            <button
              type="button"
              key={c}
              aria-pressed={category === c}
              onClick={() => updateFilter("category", category === c ? undefined : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {selection.length > 0 && total > items.length && (
        <button
          className="wm-all-matching"
          type="button"
          onClick={() => setAllMatching(!allMatching)}
        >
          {allMatching
            ? "clear all matching selection"
            : "select all " + total + " matching conversations"}
        </button>
      )}
      {desktop && (
        <div className="v98-mail-columns" aria-hidden>
          <span>From</span>
          <span>Subject</span>
          <span>Received</span>
        </div>
      )}
      <div className="wm-mail-content">
        {mail.isPending ? (
          <Skeleton />
        ) : mail.error ? (
          <Failure error={mail.error} retry={() => void mail.refetch()} />
        ) : !items.length ? (
          <Empty
            title={
              filter.query
                ? "no matches, yet."
                : view === "inbox"
                  ? "a little breathing room."
                  : "nothing here, yet."
            }
            description={filter.query ? "try fewer words or different filters." : undefined}
          >
            {filter.query && <Button onClick={() => go("inbox")}>back to inbox</Button>}
          </Empty>
        ) : (
          <ScrollMail
            key={JSON.stringify(filter)}
            cacheKey={JSON.stringify([...scope, filter])}
            className="wm-virtual-list"
            data={items}
            endReached={() => {
              if (mail.hasNextPage && !mail.isFetchingNextPage) void mail.fetchNextPage();
            }}
            itemContent={(index, item) => (
              <>
                {(index === 0 ||
                  mailPeriod(
                    items[index - 1]?.dueAt || items[index - 1]?.createdAt || "",
                    data.mailbox.timezone,
                  ) !== mailPeriod(item.dueAt || item.createdAt, data.mailbox.timezone)) && (
                  <h3 className="wm-date-section">
                    {mailPeriod(item.dueAt || item.createdAt, data.mailbox.timezone)}
                  </h3>
                )}
                <MailRow
                  item={item}
                  targetCount={
                    item.threadId && selection.includes(item.threadId) ? selection.length : 1
                  }
                  actions={mailActions({
                    items:
                      item.threadId && selection.includes(item.threadId)
                        ? items.filter((row) => !!row.threadId && selection.includes(row.threadId))
                        : [item],
                    view,
                    busy,
                    run: (type) => {
                      const ids =
                        item.threadId && selection.includes(item.threadId)
                          ? selection
                          : [item.threadId!];
                      void runAction(type, undefined, ids);
                    },
                    organize: (type) => {
                      if (!item.threadId || !selection.includes(item.threadId)) {
                        setSelection([item.threadId!]);
                        setAllMatching(false);
                      }
                      setActionModal(type);
                    },
                  })}
                  active={!!threadId && threadId === item.threadId}
                  selected={!!item.threadId && selection.includes(item.threadId)}
                  timezone={data.mailbox.timezone}
                  onOpen={() => openItem(item)}
                  onSelect={(checked, range) => {
                    const id = item.threadId!,
                      anchor = selectionAnchor.current;
                    setSelection((current) =>
                      applySelection(current, listedThreads, id, checked, anchor, range),
                    );
                    selectionAnchor.current = id;
                    setAllMatching(false);
                  }}
                  onStar={() =>
                    void runAction(item.starred ? "unstar" : "star", undefined, [item.threadId!])
                  }
                />
              </>
            )}
            components={{
              Footer: () =>
                mail.isFetchingNextPage ? <p className="wm-loading-more">loading more…</p> : null,
            }}
          />
        )}
      </div>
    </section>
  );
  const changeSort = () => updateFilter("sort", filter.sort === "newest" ? "oldest" : "newest");
  const reader = (
    <div className="wm-reader-host">
      {threadId ? (
        <Reader
          key={threadId}
          id={threadId}
          active={applicationActive}
          onCommands={setReaderCommands}
          back={() => chooseThread(null)}
          action={runAction}
          organize={(type) => {
            setSelection([threadId]);
            setActionModal(type);
          }}
        />
      ) : (
        <div className="wm-reader-idle">
          <div className="wm-reader-mark">
            <Brand href="/" />
          </div>
          <p>Select a conversation</p>
          <span>Read a message here, or start a new one from the toolbar.</span>
          <button
            type="button"
            className="wm-command-hint"
            onClick={() => useWorkspace.getState().setCommand(true)}
          >
            quick actions <kbd>Ctrl K</kbd>
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div ref={root} className={desktop ? "v98-mail-root" : undefined}>
      <div
        className={"wm " + (desktop ? "v98-mail-app " : "") + (collapsed ? "is-collapsed" : "")}
        data-density={data.mailbox.settings.density}
      >
        <a className="skip-link" href="#wm-main">
          skip to mail
        </a>
        <aside className="wm-sidebar" aria-label="mail navigation">
          <MailNavigation
            view={view}
            settings={settings}
            desktop={desktop}
            collapsed={collapsed}
            toggleCollapse={toggleCollapse}
            selection={selection}
            compose={compose}
            go={go}
            runAction={runAction}
            closeNav={() => setNav(false)}
            clearSelection={clearSelection}
          />
        </aside>
        <Sheet side open={nav} onClose={() => setNav(false)} title="your mailbox">
          <div className="wm-mobile-navigation">
            <MailNavigation
              view={view}
              settings={settings}
              desktop={desktop}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
              selection={selection}
              compose={compose}
              go={go}
              runAction={runAction}
              closeNav={() => setNav(false)}
              clearSelection={clearSelection}
            />
          </div>
        </Sheet>
        <div className="wm-workspace">
          <header className="wm-topbar">
            {desktop && (
              <Button
                primary
                className="v98-new-message"
                aria-label="New Message"
                onClick={() => void compose()}
              >
                <PencilSimpleIcon size={18} />
                <span>New Message</span>
              </Button>
            )}
            <IconButton
              label="open navigation"
              className="wm-mobile-menu"
              onClick={() => setNav(true)}
            >
              <SidebarSimpleIcon size={22} />
            </IconButton>
            <form
              className="wm-search"
              onSubmit={(e) => {
                e.preventDefault();
                updateFilter("q", query || undefined);
              }}
            >
              <MagnifyingGlassIcon size={19} />
              <input
                ref={queryInput}
                aria-label="search mail"
                placeholder="search your mail"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  e.preventDefault();
                  const applied = search.get("q") || "";
                  if (query !== applied) setQuery(applied);
                  else e.currentTarget.blur();
                }}
              />
              {(query || search.get("q")) && (
                <IconButton
                  label="clear search"
                  onClick={() => {
                    setQuery("");
                    if (search.get("q")) updateFilter("q", undefined);
                    queryInput.current?.focus();
                  }}
                >
                  <XIcon size={15} />
                </IconButton>
              )}
              <IconButton
                label="advanced search"
                onClick={() => {
                  const split = splitAdvancedSearch(query);
                  setSearchText(split.text);
                  setSearchFields(split.fields);
                  setAdvanced(true);
                }}
              >
                <FunnelIcon size={17} />
              </IconButton>
              <button type="submit" className="wm-search-key" aria-label="submit search">
                <kbd>↵</kbd>
              </button>
            </form>
            <IconButton
              label="quick actions"
              onClick={() => useWorkspace.getState().setCommand(true)}
            >
              <span className="wm-key">⌘ K</span>
            </IconButton>
          </header>
          <main id="wm-main" className="wm-main" tabIndex={-1} data-wm-location={motionLocation}>
            {wide && data.mailbox.settings.reader === "split" ? (
              <Group
                disableCursor
                orientation="horizontal"
                id="vael-mail-panels"
                defaultLayout={paneLayout.defaultLayout}
                onLayoutChanged={paneLayout.onLayoutChanged}
              >
                <Panel id="list" defaultSize="43%" minSize="320px" maxSize="60%">
                  {list}
                </Panel>
                <Separator
                  className="wm-separator"
                  aria-label="resize message list"
                  style={{ cursor: "var(--vael-cursor-col-resize, col-resize)" }}
                  onPointerDown={() => {
                    document.documentElement.dataset.vaelGesture = "e";
                  }}
                  onPointerUp={() => {
                    delete document.documentElement.dataset.vaelGesture;
                  }}
                  onPointerCancel={() => {
                    delete document.documentElement.dataset.vaelGesture;
                  }}
                  onLostPointerCapture={() => {
                    delete document.documentElement.dataset.vaelGesture;
                  }}
                />
                <Panel id="reader" minSize="350px">
                  {reader}
                </Panel>
              </Group>
            ) : (
              <>{threadId ? reader : list}</>
            )}
          </main>
          {(desktop || !online) && (
            <footer className="wm-statusbar">
              <span>
                <span className={"wm-status-dot " + (!online ? "offline" : "")} />
                <span role="status">
                  {`${total} conversations${selection.length ? `, ${selection.length} selected` : ""} · ${connectionLabel(connection)}`}
                </span>
              </span>
            </footer>
          )}
        </div>
        <CommandMenu
          go={go}
          focusSearch={() => queryInput.current?.focus()}
          showShortcuts={() => setHelp(true)}
          contextActions={
            threadId || selection.length
              ? [
                  [
                    "archive " + (selection.length ? "selected mail" : "conversation"),
                    () =>
                      void runAction(
                        "archive",
                        undefined,
                        selection.length ? selection : [threadId!],
                      ),
                  ],
                  [
                    "trash " + (selection.length ? "selected mail" : "conversation"),
                    () =>
                      void runAction(
                        "trash",
                        undefined,
                        selection.length ? selection : [threadId!],
                      ),
                  ],
                  [
                    "mark as unread",
                    () =>
                      void runAction(
                        "unread",
                        undefined,
                        selection.length ? selection : [threadId!],
                      ),
                  ],
                ]
              : []
          }
        />
        <AdvancedSearchModal
          open={advanced}
          onClose={() => setAdvanced(false)}
          text={searchText}
          setText={setSearchText}
          fields={searchFields}
          setFields={setSearchFields}
          onSearch={(q) => {
            setQuery(q);
            updateFilter("q", q || undefined);
            setAdvanced(false);
          }}
        />
        <ShortcutsModal open={help} onClose={() => setHelp(false)} go={go} />
        <ActionModal
          kind={actionModal}
          onClose={() => setActionModal(null)}
          busy={busy}
          runAction={runAction}
          go={go}
          snoozeTime={snoozeTime}
          setSnoozeTime={setSnoozeTime}
        />
        <JobModal
          job={jobModal}
          onClose={() => setJobModal(null)}
          clearSelection={clearSelection}
        />
      </div>
    </div>
  );
}
