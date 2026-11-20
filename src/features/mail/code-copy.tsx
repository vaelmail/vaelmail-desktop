import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { MailInsights } from "@/lib/mail/types";
import { IconButton } from "@/ui/controls";

export function CodeCopy({
  code,
  compact = false,
}: {
  code: NonNullable<MailInsights["detectedCode"]>;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      setCopied(true);
      toast.success("code copied");
    } catch {
      toast.error("could not copy code. select it in the message and copy manually.");
    }
  };
  const button = (
    <IconButton
      label={copied ? "code copied" : "copy verification code " + code.value}
      onClick={() => void copy()}
      onBlur={() => setCopied(false)}
      className="wm-copy-code"
    >
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
    </IconButton>
  );
  return compact ? (
    button
  ) : (
    <div className="wm-code-block" data-source-message={code.messageId}>
      <div>
        <span>verification code</span>
        <strong>{code.value}</strong>
      </div>
      {button}
    </div>
  );
}
