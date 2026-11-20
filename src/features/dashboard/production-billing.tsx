import { CoinIcon, coinName } from "@/ui/coin-icon";
import { TelegramStarIcon } from "@/ui/telegram-star-icon";
import Image from "@/ui/image";
import { AppLink as Link } from "@/shell/app-link";
import { useWindowLocation } from "@/shell/window-context";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  ClockIcon,
  WarningIcon,
  HourglassMediumIcon,
} from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/mail/client";
import { Button } from "@/ui/controls";
import { useMail } from "@/features/mailbox/context";
import { useAccount, dateLabel, money } from "./context";
import {
  prepayPeriods,
  type PrepayMonths,
  planPrices,
  termSavingsPercent,
  prepayTotal,
} from "@/lib/registration";
import { useWindowCloseGuard } from "@/shell/close-guard";
type Option = {
  asset: string;
  network: string;
  networkName: string;
  confirmations: number;
  memoRequired: boolean;
};
type Order = {
  id: string;
  months: number;
  eurCents: number;
  state: string;
  asset: string;
  network: string;
  networkName: string;
  confirmations: number | null;
  address: string | null;
  amount: string | null;
  received: string | null;
  remaining: string | null;
  memo: string | null;
  deadline: string | null;
  qr: string | null;
  warning: string;
  createdAt: string;
};
type Pending = {
  sessionId: string;
  requestId: string;
  months: PrepayMonths;
  asset: string;
  network: string;
};
const PENDING_KEY = "vael-pending-checkout";
const activeStates = [
  "creating",
  "creation-unknown",
  "waiting",
  "paying",
  "confirming",
  "verified_paid",
];
const terminalStates = [
  "granted",
  "failed",
  "expired",
  "refund-recorded",
  "manual-review",
  "underpaid",
];
const payableStates = ["waiting", "paying", "confirming"];
const ASSET_PRIORITY: Record<string, number> = {
  XMR: 10,
  USDT: 20,
  BTC: 30,
  LTC: 40,
  USDC: 50,
  ETH: 60,
  SOL: 70,
  TRX: 80,
  TON: 90,
  BNB: 100,
  BCH: 110,
  DOGE: 120,
  DASH: 130,
  DAI: 140,
};
const NETWORK_PRIORITY: Record<string, number> = {
  TRON: 10,
  SOL: 15,
  TON: 18,
  POLYGON: 20,
  BSC: 30,
  ARBITRUM: 35,
  AVALANCHE: 40,
  ETH: 90,
};
const LOW_FEE_NETWORKS = ["TRON", "SOL", "TON", "POLYGON", "BSC", "ARBITRUM", "AVALANCHE"];
const COINS_SHOWN = 8;
const MESSAGES: Record<string, string> = {
  active_invoice_exists:
    "you already have an open invoice. finish or cancel it before starting another.",
  order_limit: "too many invoices in the last hour. wait a little, then try again.",
  asset_or_network_unavailable: "that coin or network is not available right now. choose another.",
  payment_option_rejected:
    "the payment processor could not open an invoice for that coin right now. choose another coin or network.",
  checkout_unavailable: "checkout is temporarily unavailable. nothing was charged.",
  metadata_unavailable: "payment networks could not be loaded. retry in a moment.",
  provider_unavailable:
    "the payment processor did not answer. nothing was lost; retry to pick up where you left off.",
  provider_contract: "the payment processor sent an unexpected answer. retry in a moment.",
  cannot_cancel_order:
    "a payment is already on its way to this invoice, so it can no longer be cancelled.",
  order_request_conflict: "that request was already used for a different purchase. start again.",
  not_found: "that invoice no longer exists.",
  service_unavailable: "billing is temporarily unavailable. retry in a moment.",
  unauthenticated: "your session ended. sign in again to continue.",
};
const STATE_LABEL: Record<string, string> = {
  creating: "preparing invoice",
  "creation-unknown": "preparing invoice",
  waiting: "waiting for payment",
  paying: "payment detected",
  confirming: "confirming on the network",
  verified_paid: "payment verified",
  granted: "paid",
  underpaid: "underpaid",
  expired: "expired",
  failed: "failed",
  "manual-review": "in review",
  "refund-recorded": "refunded",
};
const stateLabel = (state: string) => STATE_LABEL[state] ?? state.replace(/[_-]/g, " ");
const monthsLabel = (m: number) => m + (m === 1 ? " month" : " months");
const assetRank = (a: string) => ASSET_PRIORITY[a] ?? 500;
const netRank = (n: string) => NETWORK_PRIORITY[n.toUpperCase()] ?? 500;
const failure = (e: unknown) =>
  (e instanceof ApiError && (MESSAGES[e.detail?.code] || e.message)) ||
  "payment information is unavailable. retry to check the existing invoice.";
export function ProductionBilling() {
  const { searchParams } = useWindowLocation();
  const initialOrderParam = searchParams?.get("order") || null;
  const initialMonthsParam = Number(searchParams?.get("months"));
  const { account } = useAccount(),
    { refresh } = useMail();
  const sessionId = account.sessions.find((s) => s.current)?.id;
  const [months, setMonths] = useState<PrepayMonths>(() =>
      prepayPeriods.includes(initialMonthsParam as PrepayMonths)
        ? (initialMonthsParam as PrepayMonths)
        : 1,
    ),
    [options, setOptions] = useState<Option[]>([]),
    [selection, setSelection] = useState(""),
    [allCoins, setAllCoins] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [historyVisible, setHistoryVisible] = useState(5),
    [historyError, setHistoryError] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false),
    [ack, setAck] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [loading, setLoading] = useState(true),
    [optionsLoading, setOptionsLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [pending, setPending] = useState<Pending | null>(null),
    [storageReady, setStorageReady] = useState(false);
  const pendingRef = useRef<Pending | null>(null),
    selectedId = useRef<string | null>(null),
    requestBusy = useRef(false);
  useWindowCloseGuard(() => {
    if (busy || requestBusy.current || pendingRef.current)
      throw new Error(
        "Check the pending purchase request before closing Billing. Retry uses the same request.",
      );
  });
  const selectOrder = useCallback((value: Order | null) => {
    selectedId.current = value?.id || null;
    setOrder(value);
    if (value && prepayPeriods.includes(value.months as PrepayMonths))
      setMonths(value.months as PrepayMonths);
  }, []);
  const loadOrders = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const values = await api<Order[]>(
          "/api/billing/orders",
          "GET",
          undefined,
          undefined,
          signal,
        );
        if (signal?.aborted) return;
        setOrders(values);
        setHistoryError("");
        const selected =
          values.find((v) => v.id === (selectedId.current || initialOrderParam)) ||
          values.find((v) => activeStates.includes(v.state)) ||
          null;
        selectOrder(selected);
      } catch (e) {
        if (!signal?.aborted) setHistoryError(failure(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [initialOrderParam, selectOrder],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setOptionsLoading(true);
      setEnabled(false);
      setOptions([]);
      setSelection("");
      setAck(false);
      void api<{ options: Option[]; checkoutEnabled: boolean }>(
        "/api/billing/options?months=" + months,
        "GET",
        undefined,
        undefined,
        controller.signal,
      )
        .then((v) => {
          if (!controller.signal.aborted) {
            const sorted = [...v.options].sort(
              (a, b) =>
                assetRank(a.asset) - assetRank(b.asset) ||
                netRank(a.network) - netRank(b.network) ||
                a.asset.localeCompare(b.asset) ||
                a.networkName.localeCompare(b.networkName) ||
                a.network.localeCompare(b.network),
            );
            setOptions(sorted);
            setSelection(sorted[0] ? sorted[0].asset + ":" + sorted[0].network : "");
            setEnabled(v.checkoutEnabled);
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(failure(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setOptionsLoading(false);
        });
    });
    return () => controller.abort();
  }, [months, retry]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadOrders(controller.signal);
    });
    return () => controller.abort();
  }, [loadOrders, retry]);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (raw) {
          const value = JSON.parse(raw) as Pending;
          if (
            value.sessionId === sessionId &&
            typeof value.requestId === "string" &&
            prepayPeriods.includes(value.months) &&
            typeof value.asset === "string" &&
            typeof value.network === "string"
          ) {
            pendingRef.current = value;
            setPending(value);
          } else sessionStorage.removeItem(PENDING_KEY);
        }
        setStorageReady(true);
      } catch {
        setError("session storage is unavailable. restore it before creating an invoice.");
      }
    });
    return () => {
      live = false;
    };
  }, [sessionId]);
  const deadline = order?.deadline;
  useEffect(() => {
    if (!deadline) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      const current = Date.now();
      setNow(current);
      if (Date.parse(deadline) > current) timer = setTimeout(tick, 1000);
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline]);
  const orderId = order?.id,
    orderState = order?.state;
  useEffect(() => {
    if (!orderId || !orderState || terminalStates.includes(orderState)) return;
    const controller = new AbortController(),
      id = orderId;
    let running = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        const v = await api<Order>(
          "/api/billing/orders/" + id,
          "GET",
          undefined,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted && selectedId.current === id) {
          setOrder(v);
          setOrders((old) => old.map((o) => (o.id === id ? v : o)));
          setError("");
          if (v.state === "granted") void refresh();
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(failure(e));
      } finally {
        running = false;
      }
    };
    const t = setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      controller.abort();
      document.removeEventListener("visibilitychange", poll);
    };
  }, [orderId, orderState, refresh]);
  const expired = !!order?.deadline && Date.parse(order.deadline) <= now;
  const payable = order && !expired && payableStates.includes(order.state) && order.address;
  const selected = options.find((option) => option.asset + ":" + option.network === selection);
  async function submit(value: Pending) {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
      pendingRef.current = value;
      setPending(value);
      const created = await api<Order>("/api/billing/orders", "POST", {
        requestId: value.requestId,
        months: value.months,
        asset: value.asset,
        network: value.network,
      });
      sessionStorage.removeItem(PENDING_KEY);
      pendingRef.current = null;
      setPending(null);
      selectOrder(created);
      setOrders((old) => [created, ...old.filter((v) => v.id !== created.id)]);
      if (created.state === "granted") void refresh();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![401, 403, 429].includes(e.status)
      ) {
        try {
          sessionStorage.removeItem(PENDING_KEY);
          pendingRef.current = null;
          setPending(null);
        } catch {}
        if (e.detail?.code === "active_invoice_exists") void loadOrders();
      }
      setError(failure(e));
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }
  async function cancelInvoice(orderToCancel: Order) {
    if (busy) return;
    if (
      !window.confirm(
        "Cancel this payment invoice? Any unpaid transaction to this address will not be credited automatically.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/billing/orders/${orderToCancel.id}/cancel`, "POST");
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {}
      pendingRef.current = null;
      setPending(null);
      selectOrder(null);
      setAck(false);
      await loadOrders();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  function create() {
    if (!selected || !sessionId || pendingRef.current) return;
    void submit({
      sessionId,
      requestId: crypto.randomUUID(),
      months,
      asset: selected.asset,
      network: selected.network,
    });
  }
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyValue = (field: string, val: string) => {
    void navigator.clipboard
      .writeText(val)
      .then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 2000);
      })
      .catch(() => setError("copy unavailable; select the value manually"));
  };
  const formatCountdown = (deadlineStr: string | null) => {
    if (!deadlineStr) return null;
    const ms = Date.parse(deadlineStr) - now;
    if (ms <= 0) return "0:00";
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };
  const leave = () => {
    selectOrder(null);
    setAck(false);
  };
  const assets = options.filter(
    (option, index) => options.findIndex((o) => o.asset === option.asset) === index,
  );
  const shownAssets =
    allCoins || assets.length <= COINS_SHOWN + 1
      ? assets
      : assets.filter((option, index) => index < COINS_SHOWN || option.asset === selected?.asset);
  const networks = selected ? options.filter((option) => option.asset === selected.asset) : [];
  const choose = (option: Option) => {
    setSelection(option.asset + ":" + option.network);
    setAck(false);
  };
  const remainingMs = order?.deadline ? Date.parse(order.deadline) - now : 0;
  const step = !order
    ? 0
    : order.state === "granted"
      ? 3
      : ["confirming", "verified_paid"].includes(order.state)
        ? 2
        : 1;
  const due = order?.remaining || order?.amount;
  const copyButton = (field: string, value: string, label: string) => (
    <button
      type="button"
      className="da-pay-copy"
      aria-label={"copy " + label}
      onClick={() => copyValue(field, value)}
    >
      {copiedField === field ? (
        <>
          <CheckIcon size={14} weight="bold" aria-hidden="true" /> copied
        </>
      ) : (
        <>
          <CopyIcon size={14} aria-hidden="true" /> copy
        </>
      )}
    </button>
  );
  return (
    <>
      <section className="da-billing-current">
        <div>
          <h2>vael {account.plan}</h2>
          <p>
            {account.plan === "plus"
              ? "prepaid until " + dateLabel(account.plusExpiresAt) + " · no automatic renewal"
              : "free to receive. plus when you need more."}
          </p>
        </div>
      </section>
      <section className="da-card da-purchase-card">
        {order ? (
          <div className="da-pay">
            <header className="da-pay-head">
              <div>
                <h2>vael plus · {monthsLabel(order.months)}</h2>
                <p className="da-pay-sub">
                  <strong>{money(order.eurCents / 100)}</strong>
                  <span className="da-pay-coin">
                    <CoinIcon asset={order.asset} />
                    {order.asset} · {order.networkName}
                  </span>
                </p>
              </div>
              {payable && order.deadline && (
                <div
                  className={"da-pay-timer" + (remainingMs < 300000 ? " urgent" : "")}
                  title="time left to send this payment"
                >
                  <ClockIcon size={15} aria-hidden="true" />
                  <span>
                    <small>expires in</small>
                    <time>{formatCountdown(order.deadline)}</time>
                  </span>
                </div>
              )}
            </header>

            {(payable || step > 1) && (
              <>
                <ol className="da-pay-steps" aria-label="payment progress">
                  {["send payment", "network confirms", "plus active"].map((label, index) => (
                    <li
                      key={label}
                      className={step > index + 1 ? "done" : step === index + 1 ? "current" : ""}
                      aria-current={step === index + 1 ? "step" : undefined}
                    >
                      <span className="da-pay-step-mark" aria-hidden="true">
                        {step > index + 1 ? <CheckIcon size={11} weight="bold" /> : index + 1}
                      </span>
                      {label}
                    </li>
                  ))}
                </ol>
              </>
            )}

            {payable && (
              <>
                <p className="da-pay-status" role="status">
                  <span
                    className={
                      "da-status-dot " + (order.state === "waiting" ? "pulsing" : "active")
                    }
                  />
                  {order.remaining
                    ? "part of the payment arrived. send the rest to finish."
                    : order.state === "waiting"
                      ? "waiting for your payment. this page updates by itself."
                      : order.state === "paying"
                        ? "payment detected. waiting for the network."
                        : "payment seen. waiting for network confirmations."}
                </p>

                {order.remaining && (
                  <div className="da-pay-note da-pay-note-warn" role="alert">
                    <WarningIcon size={18} aria-hidden="true" />
                    <p>
                      <strong>
                        {order.received} {order.asset} received
                      </strong>{" "}
                      of {order.amount} {order.asset}. exchanges often take their withdrawal fee out
                      of what you send. send the remaining{" "}
                      <strong>
                        {order.remaining} {order.asset}
                      </strong>{" "}
                      to the same address before the timer runs out.
                    </p>
                  </div>
                )}

                <div className="da-pay-body">
                  {order.qr && (
                    <figure className="da-pay-qr">
                      <div className="da-pay-qr-frame">
                        <Image
                          unoptimized
                          alt="QR code of the payment address. enter the amount yourself."
                          src={order.qr}
                          width={176}
                          height={176}
                        />
                        <span className="da-pay-qr-coin" aria-hidden="true">
                          <CoinIcon asset={order.asset} />
                        </span>
                      </div>
                      <figcaption>scan for the address, then enter the amount</figcaption>
                    </figure>
                  )}

                  <dl className="da-pay-fields">
                    <div className="da-pay-field">
                      <dt>{order.remaining ? "remaining to send" : "send exactly"}</dt>
                      <dd>
                        <span className="da-pay-amount">
                          {due} <b>{order.asset}</b>
                        </span>
                        {copyButton("amount", due!, "amount")}
                      </dd>
                    </div>
                    <div className="da-pay-field">
                      <dt>
                        to this address
                        <span className="da-pay-network">{order.networkName} network</span>
                      </dt>
                      <dd>
                        <code>{order.address}</code>
                        {copyButton("address", order.address!, "address")}
                      </dd>
                    </div>
                    {order.memo && (
                      <div className="da-pay-field">
                        <dt>
                          memo / tag
                          <span className="da-pay-network da-pay-required">required</span>
                        </dt>
                        <dd>
                          <code>{order.memo}</code>
                          {copyButton("memo", order.memo, "memo")}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                <ul className="da-pay-hints">
                  <li>
                    send only <strong>{order.asset}</strong> on <strong>{order.networkName}</strong>
                    . another coin or network cannot be credited.
                  </li>
                  <li>
                    paying from an exchange? add its withdrawal fee on top so the full amount
                    arrives.
                  </li>
                  <li>
                    plus turns on by itself once the network confirms
                    {order.confirmations ? ` (${order.confirmations} confirmations)` : ""}. you can
                    close this window meanwhile.
                  </li>
                </ul>

                {order.state === "waiting" && (
                  <div className="da-pay-actions">
                    <Button onClick={() => void cancelInvoice(order)} disabled={busy}>
                      cancel and choose another coin
                    </Button>
                  </div>
                )}
              </>
            )}

            {order.state === "verified_paid" && (
              <div className="da-pay-result" role="status">
                <span className="da-pay-result-icon ok">
                  <CheckIcon size={22} weight="bold" aria-hidden="true" />
                </span>
                <h3>payment verified</h3>
                <p>activating your plus term. this takes a few seconds.</p>
              </div>
            )}

            {order.state === "granted" && (
              <div className="da-pay-result" role="status">
                <span className="da-pay-result-icon ok">
                  <CheckIcon size={22} weight="bold" aria-hidden="true" />
                </span>
                <h3>payment confirmed</h3>
                <p>
                  {account.plusExpiresAt
                    ? "vael plus is active until " + dateLabel(account.plusExpiresAt) + "."
                    : "your vael plus term has been added."}
                </p>
                <Button primary onClick={leave}>
                  done
                </Button>
              </div>
            )}

            {["creating", "creation-unknown"].includes(order.state) && (
              <div className="da-pay-result" role="status">
                <span className="da-pay-result-icon">
                  <HourglassMediumIcon size={22} aria-hidden="true" />
                </span>
                <h3>preparing your invoice</h3>
                <p>
                  the payment processor has not answered yet. no address exists, so there is nothing
                  to pay. this page keeps checking.
                </p>
                <Button onClick={() => void cancelInvoice(order)} disabled={busy}>
                  cancel and start again
                </Button>
              </div>
            )}

            {(order.state === "expired" || (expired && payableStates.includes(order.state))) && (
              <div className="da-pay-result" role="alert">
                <span className="da-pay-result-icon warn">
                  <ClockIcon size={22} aria-hidden="true" />
                </span>
                <h3>this invoice expired</h3>
                <p>
                  do not send anything to its address now. if you already paid before it expired,
                  the payment is still being matched and plus turns on by itself.
                </p>
                <Button primary disabled={busy || !!pending} onClick={leave}>
                  start a new payment
                </Button>
              </div>
            )}

            {order.state === "underpaid" && (
              <div className="da-pay-result" role="alert">
                <span className="da-pay-result-icon warn">
                  <WarningIcon size={22} aria-hidden="true" />
                </span>
                <h3>less than the full amount arrived</h3>
                <p>
                  this usually means an exchange took its fee out of the transfer. write to{" "}
                  <strong>vael-support@vael.email</strong> with order <code>{order.id}</code> and we
                  will sort it out.
                </p>
                <Button disabled={busy || !!pending} onClick={leave}>
                  back to plans
                </Button>
              </div>
            )}

            {["manual-review", "failed", "refund-recorded"].includes(order.state) && (
              <div className="da-pay-result" role="status">
                <span className="da-pay-result-icon warn">
                  <WarningIcon size={22} aria-hidden="true" />
                </span>
                <h3>
                  {order.state === "failed"
                    ? "this payment did not go through"
                    : order.state === "refund-recorded"
                      ? "this payment was refunded"
                      : "this payment needs a manual check"}
                </h3>
                <p>
                  {order.state === "failed"
                    ? "no plus term was added. you can start a new payment."
                    : order.state === "refund-recorded"
                      ? "no plus term was added for this order."
                      : "nothing was activated automatically. if you sent funds, write to "}
                  {order.state === "manual-review" && (
                    <>
                      <strong>vael-support@vael.email</strong> with order <code>{order.id}</code>.
                    </>
                  )}
                </p>
                <Button disabled={busy || !!pending} onClick={leave}>
                  back to plans
                </Button>
              </div>
            )}

            {payable && order.warning && <p className="da-small da-pay-warning">{order.warning}</p>}
          </div>
        ) : (
          <>
            <div className="da-purchase-intro">
              <h2>choose your plus term</h2>
              <p>
                from €4.00 a month with annual prepay · 1 gb storage · 50 custom and unlimited
                random aliases · sending from your address and aliases · three receive-only domains.
              </p>
            </div>
            <fieldset className="da-periods" disabled={busy || !!pending}>
              <legend>1 · how long</legend>
              {prepayPeriods.map((m) => {
                const price = planPrices[m];
                const rate = (price / m).toFixed(2);
                const discount = termSavingsPercent(m);
                return (
                  <label key={m} className={months === m ? "selected" : ""}>
                    <input
                      type="radio"
                      name="duration"
                      checked={months === m}
                      onChange={() => setMonths(m)}
                    />
                    <div className="da-period-top">
                      <span>{monthsLabel(m)}</span>
                      {discount > 0 ? (
                        <span className="da-discount-tag">save {discount}%</span>
                      ) : null}
                    </div>
                    <div className="da-period-price-wrap">
                      <strong className="da-period-price">{money(price)}</strong>
                    </div>
                    <small>€{rate}/mo · no auto-debit</small>
                  </label>
                );
              })}
            </fieldset>
            {pending && (
              <div className="da-pay-note" role="status">
                <HourglassMediumIcon size={18} aria-hidden="true" />
                <div>
                  <p>
                    your last invoice request did not get an answer. check it before starting
                    another; this never creates a second invoice.
                  </p>
                  <Button disabled={busy} onClick={() => void submit(pending)}>
                    {busy ? "checking…" : "check my invoice request"}
                  </Button>
                </div>
              </div>
            )}
            {!pending && (
              <>
                <fieldset className="da-coins" disabled={busy}>
                  <legend>2 · pay with</legend>
                  {optionsLoading ? (
                    <div className="da-coin-grid" role="status" aria-label="loading coins">
                      {Array.from({ length: 4 }, (_, i) => (
                        <span key={i} className="da-coin da-coin-skeleton" />
                      ))}
                    </div>
                  ) : !enabled && !error ? (
                    <p className="da-pay-note">
                      <HourglassMediumIcon size={18} aria-hidden="true" />
                      <span>
                        crypto checkout is not open right now. you can still upgrade with Telegram
                        Stars below.
                      </span>
                    </p>
                  ) : !options.length && !error ? (
                    <p className="da-small">
                      no coin can carry this amount right now. choose another duration or retry
                      later.
                    </p>
                  ) : (
                    <>
                      <div className="da-coin-grid">
                        {shownAssets.map((option) => (
                          <label
                            key={option.asset}
                            className={
                              "da-coin" + (selected?.asset === option.asset ? " selected" : "")
                            }
                          >
                            <input
                              type="radio"
                              name="coin"
                              checked={selected?.asset === option.asset}
                              onChange={() => choose(option)}
                            />
                            <CoinIcon asset={option.asset} />
                            <span>
                              <strong>{option.asset}</strong>
                              <small>{coinName(option.asset)}</small>
                            </span>
                          </label>
                        ))}
                        {assets.length > shownAssets.length && (
                          <button
                            type="button"
                            className="da-coin da-coin-more"
                            onClick={() => setAllCoins(true)}
                          >
                            +{assets.length - shownAssets.length} more
                          </button>
                        )}
                      </div>
                      {networks.length > 1 && (
                        <div className="da-networks">
                          <span className="da-networks-label" id="da-network-label">
                            {selected!.asset} network
                          </span>
                          <div role="radiogroup" aria-labelledby="da-network-label">
                            {networks.map((option) => (
                              <label
                                key={option.network}
                                className={
                                  "da-network" +
                                  (selected!.network === option.network ? " selected" : "")
                                }
                              >
                                <input
                                  type="radio"
                                  name="network"
                                  checked={selected!.network === option.network}
                                  onChange={() => choose(option)}
                                />
                                {option.networkName}
                                {LOW_FEE_NETWORKS.includes(option.network.toUpperCase()) && (
                                  <small>low fee</small>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected && (
                        <p className="da-small da-coin-summary">
                          {selected.network.toUpperCase() === "ETH" && networks.length > 1
                            ? "ethereum fees can be several dollars. a low-fee network costs cents."
                            : networks.length > 1
                              ? `your wallet must send ${selected.asset} on ${selected.networkName}.`
                              : `paid on the ${selected.networkName} network.`}
                          {selected.memoRequired ? " a memo or destination tag is required." : ""}
                        </p>
                      )}
                    </>
                  )}
                </fieldset>
                <div className="da-order-total">
                  <span>
                    total for {monthsLabel(months)}
                    {selected ? ` · paid in ${selected.asset}` : ""}
                  </span>
                  <div className="da-order-total-values">
                    <strong>{money(prepayTotal(months))}</strong>
                    {termSavingsPercent(months) > 0 ? (
                      <span className="da-discount-tag">save {termSavingsPercent(months)}%</span>
                    ) : null}
                  </div>
                </div>
                <label className="da-checkbox da-billing-ack">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span className="da-checkbox-art" aria-hidden="true">
                    <CheckIcon size={12} weight="bold" />
                  </span>
                  <span className="da-billing-ack-text">
                    i will send the exact amount on the chosen network within one hour. i accept the{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener"
                      className="da-terms-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      terms
                    </Link>
                    , including the no-voluntary-refunds policy.
                  </span>
                </label>
                <Button
                  primary
                  className="da-pay-submit"
                  disabled={
                    busy ||
                    loading ||
                    !!historyError ||
                    !storageReady ||
                    !sessionId ||
                    optionsLoading ||
                    !enabled ||
                    !selected ||
                    !ack
                  }
                  onClick={create}
                >
                  {busy
                    ? "creating invoice…"
                    : selected && enabled
                      ? `pay ${money(prepayTotal(months))} with ${selected.asset}`
                      : "continue to payment"}
                </Button>
                <p className="da-small da-pay-terms">
                  the term is added when payment confirms. an active plan extends from its current
                  expiry; an expired one starts fresh. no automatic renewal.
                </p>
              </>
            )}
            <p className="da-pay-stars">
              <TelegramStarIcon size={18} animated />
              <span>
                prefer <strong>Telegram Stars</strong>? upgrade inside our bot.
              </span>
              <a href="https://t.me/vaelmail_bot" target="_blank" rel="noopener noreferrer">
                open @vaelmail_bot ↗
              </a>
            </p>
          </>
        )}
        {error && (
          <div className="da-pay-error">
            <p role="alert" className="da-error">
              {error}
            </p>
            <Button
              disabled={busy}
              onClick={() => {
                setError("");
                setRetry((v) => v + 1);
                if (order)
                  void api<Order>("/api/billing/orders/" + order.id)
                    .then(selectOrder)
                    .catch((e) => setError(failure(e)));
              }}
            >
              retry
            </Button>
          </div>
        )}
      </section>
      <section className="da-section da-panel">
        <h2>purchase history</h2>
        {loading ? (
          <p role="status">loading purchase history…</p>
        ) : historyError ? (
          <div>
            <p role="alert">{historyError}</p>
            <Button onClick={() => void loadOrders()}>retry purchase history</Button>
          </div>
        ) : orders.length ? (
          orders.slice(0, historyVisible).map((o) => (
            <div className="da-setting-row da-history-row" key={o.id}>
              <div>
                <h3>
                  {monthsLabel(o.months)} · {money(o.eurCents / 100)}
                </h3>
                <p>
                  {dateLabel(o.createdAt)} · {o.asset}
                  {o.networkName && o.networkName !== o.asset ? " on " + o.networkName : ""}
                </p>
              </div>
              <div className="da-history-side">
                <span className={"da-history-state da-history-" + o.state}>
                  {stateLabel(o.state)}
                </span>
                {["waiting", "creating", "creation-unknown"].includes(o.state) && (
                  <Button disabled={busy} onClick={() => void cancelInvoice(o)}>
                    cancel
                  </Button>
                )}
                {o.id !== order?.id && (
                  <Button disabled={busy} onClick={() => selectOrder(o)}>
                    {activeStates.includes(o.state) ? "open" : "details"}
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="da-muted">no purchases yet.</p>
        )}
        {orders.length > 5 && (
          <div className="da-inline-actions">
            {historyVisible < orders.length && (
              <Button onClick={() => setHistoryVisible((n) => n + 5)}>Show more</Button>
            )}
            {historyVisible > 5 && <Button onClick={() => setHistoryVisible(5)}>Show less</Button>}
          </div>
        )}
      </section>
    </>
  );
}
