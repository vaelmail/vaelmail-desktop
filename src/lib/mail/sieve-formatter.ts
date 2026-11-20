import type { Folder, Label, RuleAction, RuleCondition } from "./types";

const quote = (s: string) =>
  '"' +
  s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$\{/g, "${vael_literal_dollar}{")
    .replace(/[\r\n]/g, " ") +
  '"';

const ATTACHMENT_TEST =
  'anyof (header :mime :anychild :type :is "Content-Disposition" "attachment", header :mime :anychild :param "filename" :matches "Content-Disposition" "?*", header :mime :anychild :param "name" :matches "Content-Type" "?*")';

export function formatSingleSieveRule(
  rule: {
    name?: string;
    enabled?: boolean;
    match?: "all" | "any";
    conditions?: RuleCondition[];
    actions?: RuleAction[];
  },
  folders: Folder[] = [],
  labels: Label[] = [],
): string {
  const name = rule.name || "Untitled Rule";
  const conditions = rule.conditions || [];
  const actions = rule.actions || [];
  const match = rule.match || "all";

  const lines: string[] = [];
  lines.push(`# Rule: ${name}`);
  if (rule.enabled === false) {
    lines.push("# Status: DISABLED (will not execute on incoming mail)");
  }

  if (conditions.length === 0) {
    lines.push("# No conditions specified (always matches)");
  }

  const tests = conditions.map((c) => {
    if (c.field === "attachment") {
      return (c.value === "no" ? "not " : "") + ATTACHMENT_TEST;
    }
    const headerName =
      c.field === "to"
        ? '["To", "Cc", "Bcc", "X-Vael-Delivered-To"]'
        : quote(c.field === "from" ? "From" : "Subject");
    return `header :contains ${headerName} ${quote(c.value || "")}`;
  });

  const actionLines: string[] = [];
  let isTerminal = false;

  for (const a of actions) {
    if (a.type === "read") {
      actionLines.push('  addflag "\\\\Seen";');
    } else if (a.type === "star") {
      actionLines.push('  addflag "\\\\Flagged";');
    } else if (a.type === "label") {
      const labelName = labels.find((l) => l.id === a.value)?.name || a.value;
      actionLines.push(`  # Label: ${labelName}`);
      actionLines.push(`  addflag ${quote("vael_" + a.value.replace(/-/g, ""))};`);
    } else if (a.type === "archive") {
      actionLines.push('  set "vael_destination" "Archive";');
      isTerminal = true;
    } else if (a.type === "spam") {
      actionLines.push('  set "vael_destination" "Spam";');
      isTerminal = true;
    } else if (a.type === "move") {
      const targetFolder = folders.find((f) => f.id === a.value)?.name || a.value || "INBOX";
      actionLines.push(`  set "vael_destination" ${quote(targetFolder)};`);
      isTerminal = true;
    }
  }

  if (isTerminal) {
    actionLines.push('  set "vael_terminal" "yes"; # Terminal action: stops downstream rules');
  }

  const testCondition =
    tests.length > 0
      ? `${match === "all" ? "allof" : "anyof"} (\n    ${tests.join(",\n    ")}\n  )`
      : "true";

  lines.push(`if allof (string :is "\${vael_terminal}" "no", ${testCondition}) {`);
  if (actionLines.length > 0) {
    lines.push(actionLines.join("\n"));
  } else {
    lines.push("  # No actions defined");
  }
  lines.push("}");

  return lines.join("\n");
}
