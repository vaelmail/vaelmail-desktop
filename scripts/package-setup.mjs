import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = process.argv[2] || "";
const version = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;
const release = join(root, "target", target, "release");
const bundle = join(release, "bundle");
const arm = target ? target.startsWith("aarch64") : process.arch === "arm64";
const arch = arm ? "arm64" : "x64";

function find(directory, test) {
  if (!existsSync(directory)) return null;
  const match = readdirSync(directory).find(test);
  return match ? join(directory, match) : null;
}

function run(command, args, env, cwd = root) {
  execFileSync(command, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit", shell: process.platform === "win32" });
}

let payload;
let output;
if (process.platform === "win32") {
  payload = find(join(bundle, "nsis"), (name) => name.endsWith("-setup.exe"));
} else if (process.platform === "darwin") {
  payload = find(join(bundle, "macos"), (name) => name.endsWith(".app.tar.gz"));
} else {
  payload = find(join(bundle, "appimage"), (name) => name.endsWith(".AppImage"));
}
if (!payload) throw new Error("no app bundle found to put inside VaelMail Setup");

const env = { VAEL_SETUP_PAYLOAD: payload, VAEL_SETUP_VERSION: version };
if (process.platform === "darwin") {
  run("pnpm", ["exec", "tauri", "build", "--bundles", "app", ...(target ? ["--target", target] : [])], env, join(root, "installer"));
  const app = find(join(bundle, "macos"), (name) => name === "VaelMail Setup.app");
  if (!app) throw new Error("VaelMail Setup.app was not built");
  output = join(root, `VaelMail-Setup-macos-${arch === "arm64" ? "apple-silicon" : "intel"}.zip`);
  run("ditto", ["-c", "-k", "--keepParent", app, output], {});
} else {
  run("cargo", ["build", "--release", "-p", "vaelmail-setup", ...(target ? ["--target", target] : [])], env);
  const binary = join(release, process.platform === "win32" ? "vaelmail-setup.exe" : "vaelmail-setup");
  const name = process.platform === "win32" ? `VaelMail-Setup-windows-${arch}.exe` : `VaelMail-Setup-linux-${arch}`;
  output = join(root, name);
  run(process.platform === "win32" ? "copy" : "cp", [binary, output], {});
}
console.log(output);
