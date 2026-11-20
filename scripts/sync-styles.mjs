import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { generate, parse, walk } from "css-tree";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.env.VAEL_WEB ?? join(root, "..", "vaelmail_prod"));
const target = join(root, "src", "styles", "vael98");

const stylesheets = [
  "src/app/globals.css",
  "src/components/privacy-mode.css",
  "src/components/ui/controls.css",
  "src/design-system/98/base.css",
  "src/design-system/98/tokens.css",
  "src/design-system/98/controls.css",
  "src/components/desktop/desktop.css",
  "src/components/desktop/tools.css",
  "src/app/(workspace)/webmail/webmail.css",
  "src/app/(workspace)/dashboard/dashboard.css",
  "src/components/desktop/workspace.css",
  "src/components/desktop/auth.css",
  "src/components/desktop/polish.css",
  "src/components/desktop/wallpaper.css",
  "src/components/desktop/interactions.css",
  "src/design-system/cursors.css",
  "src/design-system/scrollbars.css",
];

const excludedClass = new RegExp(
  "^(" +
    [
      "pricing",
      "prepay",
      "faq",
      "hero",
      "registration",
      "blog",
      "document",
      "system",
      "canary",
      "operator",
      "telegram",
      "tg",
      "support",
      "public",
      "welcome",
      "signup",
      "bulletin",
      "arcade",
      "staff",
      "nojs",
      "plan",
      "donate",
      "comparison",
      "vaelmask-site",
    ].join("|") +
    ")(-|_|$)",
);

const assets = [
  ["public/fonts/vael98", "public/fonts/vael98"],
  ["public/cursors", "public/cursors"],
  ["public/wallpapers/vael-night-garden-v1.webp", "public/wallpapers/vael-night-garden-v1.webp"],
];

function classesOf(selector) {
  const names = [];
  walk(selector, (node) => {
    if (node.type === "ClassSelector") names.push(node.name);
  });
  return names;
}

function excluded(selector) {
  const names = classesOf(selector);
  return names.length > 0 && names.some((name) => excludedClass.test(name));
}

function prune(list) {
  list.forEach((node, item) => {
    if (node.type === "Rule") {
      if (node.prelude.type === "SelectorList") {
        node.prelude.children.forEach((selector, selectorItem, selectors) => {
          if (excluded(selector)) selectors.remove(selectorItem);
        });
        if (node.prelude.children.isEmpty) list.remove(item);
      }
      return;
    }
    if (node.type === "Atrule" && node.block && node.block.children) {
      if (node.name === "keyframes" || node.name === "font-face") return;
      prune(node.block.children);
      if (node.block.children.isEmpty) list.remove(item);
    }
  });
}

async function convert(file) {
  const css = await readFile(join(source, file), "utf8");
  const tree = parse(css, { positions: false });
  prune(tree.children);
  return format(generate(tree), { parser: "css", printWidth: 100 });
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const names = [];
for (const [index, file] of stylesheets.entries()) {
  const name = `${String(index + 1).padStart(2, "0")}-${file.split("/").pop()}`;
  await writeFile(join(target, name), await convert(file));
  names.push(name);
}

await writeFile(
  join(target, "index.css"),
  names.map((name) => `@import "./${name}";`).join("\n") + "\n",
);

for (const [from, to] of assets) {
  await mkdir(dirname(join(root, to)), { recursive: true });
  await cp(join(source, from), join(root, to), { recursive: true });
}

console.log(`synced ${names.length} stylesheets from ${source}`);
