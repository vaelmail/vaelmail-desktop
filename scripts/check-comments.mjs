import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipped = new Set(["node_modules", "dist", "target", "gen", ".git", "vael98"]);
const offences = [];

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function scriptComments(path, text) {
  const kind = path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const seen = new Set();
  const collect = (ranges) => {
    for (const range of ranges ?? []) seen.add(range.pos);
  };
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const offset of seen) offences.push([path, offset]);
}

function lineOf(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function stripStrings(source) {
  return source
    .replace(/r#*"[\s\S]*?"#*/g, (m) => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n]){1,2}'/g, (m) => " ".repeat(m.length));
}

function rustComments(path, text) {
  const cleaned = stripStrings(text);
  const pattern = /\/\/|\/\*/g;
  let match = pattern.exec(cleaned);
  while (match) {
    offences.push([path, match.index]);
    match = pattern.exec(cleaned);
  }
}

function cssComments(path, text) {
  const index = text.indexOf("/*");
  if (index >= 0) offences.push([path, index]);
}

for await (const path of walk(root)) {
  const extension = extname(path);
  if (![".ts", ".tsx", ".js", ".mjs", ".rs", ".css"].includes(extension)) continue;
  const text = await readFile(path, "utf8");
  if (extension === ".rs") rustComments(path, text);
  else if (extension === ".css") cssComments(path, text);
  else scriptComments(path, text);
}

if (offences.length > 0) {
  for (const [path, offset] of offences) {
    const text = await readFile(path, "utf8");
    console.error(`${relative(root, path)}:${lineOf(text, offset)} comment`);
  }
  process.exit(1);
}

console.log("no comments found");
