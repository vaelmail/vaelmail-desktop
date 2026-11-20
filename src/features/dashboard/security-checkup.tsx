import { AppLink as NextLink } from "@/shell/app-link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { Button, Skeleton } from "@/ui/controls";
import { securityCheckup, type CheckupItem } from "@/lib/encryption/api";
import { AccountSection, InlineError } from "./ui";
import { PanicLock } from "./security-events";

const statusCopy: Record<CheckupItem["status"], string> = {
  ok: "done",
  warn: "needs attention",
  todo: "to do",
};

function internalHref(href: string | undefined) {
  return href && href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")
    ? href
    : null;
}

export function SecurityCheckup() {
  const checkup = useQuery({
    queryKey: ["security-checkup"],
    queryFn: ({ signal }) => securityCheckup(signal),
    retry: false,
  });
  const items = checkup.data || [];
  const open = items.filter((i) => i.status !== "ok").length;
  return (
    <>
      <AccountSection
        title="your checklist"
        id="setting-security-checkup"
        description={
          checkup.data
            ? open
              ? `${open} ${open === 1 ? "item needs" : "items need"} a look.`
              : "everything on this list is in place."
            : "a quick review of how your account is protected."
        }
      >
        {checkup.isPending && <Skeleton variant="panel" />}
        {checkup.error && (
          <>
            <InlineError message="the security checkup could not be loaded." />
            <Button onClick={() => void checkup.refetch()}>retry</Button>
          </>
        )}
        {!!items.length && (
          <ul className="da-checkup">
            {items.map((item) => {
              const href = internalHref(item.action?.href);
              return (
                <li key={item.id} className={"da-checkup-item " + item.status}>
                  <span className="da-checkup-icon">
                    {item.status === "ok" ? (
                      <CheckCircleIcon size={20} weight="fill" aria-hidden />
                    ) : item.status === "warn" ? (
                      <WarningCircleIcon size={20} weight="fill" aria-hidden />
                    ) : (
                      <CircleDashedIcon size={20} aria-hidden />
                    )}
                    <span className="sr-only">{statusCopy[item.status]}: </span>
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  {href && item.action && (
                    <NextLink className="wm-button" href={href}>
                      {item.action.label}
                      <ArrowRightIcon size={15} aria-hidden />
                    </NextLink>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </AccountSection>
      <PanicLock />
    </>
  );
}

const missingShown = 3;

export function SecurityCheckupCard() {
  const checkup = useQuery({
    queryKey: ["security-checkup"],
    queryFn: ({ signal }) => securityCheckup(signal),
    retry: false,
  });
  const items = checkup.data || [];
  const done = items.filter((i) => i.status === "ok").length;
  const missing = items.filter((i) => i.status !== "ok");
  const ready = !!items.length;
  return (
    <section className="da-card da-security-card da-checkup-card">
      <div className="da-card-title">
        <h2>security checkup</h2>
        <ShieldCheckIcon size={22} aria-hidden />
      </div>
      {checkup.isPending && <Skeleton variant="panel" />}
      {checkup.error && <p>the checkup could not be loaded.</p>}
      {!checkup.isPending && !checkup.error && !ready && <p>nothing to check yet.</p>}
      {ready && (
        <>
          <div className="da-checkup-score">
            <strong>
              {done}/{items.length}
            </strong>
            <span>done</span>
          </div>
          <div
            className="da-checkup-bar"
            role="progressbar"
            aria-label="checkup progress"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
          >
            {items.map((item) => (
              <span key={item.id} className={item.status === "ok" ? "on" : ""} />
            ))}
          </div>
          <p>
            {missing.length ? (
              <>
                <span className="da-checkup-label">missing</span>{" "}
                {missing
                  .slice(0, missingShown)
                  .map((i) => i.title.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()))
                  .join(", ")}
                {missing.length > missingShown && ` and ${missing.length - missingShown} more`}
              </>
            ) : (
              "everything is in place."
            )}
          </p>
        </>
      )}
      <NextLink className="da-text-link" href="/dashboard/checkup">
        {ready && missing.length ? "finish the checkup" : "open checkup"}
        <ArrowRightIcon size={16} aria-hidden />
      </NextLink>
    </section>
  );
}
