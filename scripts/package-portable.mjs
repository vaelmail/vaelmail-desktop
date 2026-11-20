import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const { productName, version } = config;
const target = process.argv[2] ?? "";
const release = join(root, "target", target, "release");
const output = join(root, "dist-portable");
const staging = join(output, productName);

const marker = `${productName} runs in portable mode while this file sits next to it.

Settings, the offline cache, the web view data and your saved sign-in are kept in the
"${productName} Data" folder beside it instead of your user profile. Nothing is written
to the registry, the system keychain or your login items.

Keep this folder on a drive only you can reach: the saved sign-in is as private as the
drive itself. Delete this file to switch the same copy back to the normal locations.
`;

const architectures = {
  x86_64: { windows: "x64", linux: "amd64", darwin: "x64" },
  aarch64: { windows: "arm64", linux: "aarch64", darwin: "aarch64" },
};

function architecture(platform) {
  const machine = target.split("-")[0] || (process.arch === "arm64" ? "aarch64" : "x86_64");
  return architectures[machine]?.[platform] ?? machine;
}

function single(directory, extension) {
  const found = existsSync(directory)
    ? readdirSync(directory).filter((name) => name.endsWith(extension))
    : [];
  if (found.length !== 1) {
    throw new Error(`expected one ${extension} in ${directory}, found ${found.length}`);
  }
  return join(directory, found[0]);
}

function prepare() {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  writeFileSync(join(staging, `${productName}.portable`), marker);
}

function windows() {
  const binary = join(release, `${config.mainBinaryName ?? "vaelmail-desktop"}.exe`);
  copyFileSync(binary, join(staging, `${productName}.exe`));
  const archive = join(
    output,
    `${productName}_${version}_windows-${architecture("windows")}-portable.zip`,
  );
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${staging}' -DestinationPath '${archive}' -Force`,
    ],
    { stdio: "inherit" },
  );
  return archive;
}

function macos() {
  const bundle = join(release, "bundle", "macos", `${productName}.app`);
  cpSync(bundle, join(staging, `${productName}.app`), { recursive: true, verbatimSymlinks: true });
  const archive = join(
    output,
    `${productName}_${version}_macos-${architecture("darwin")}-portable.zip`,
  );
  execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", staging, archive], {
    stdio: "inherit",
  });
  return archive;
}

function linux() {
  const image = single(join(release, "bundle", "appimage"), ".AppImage");
  copyFileSync(image, join(staging, `${productName}.AppImage`));
  execFileSync("chmod", ["755", join(staging, `${productName}.AppImage`)]);
  const archive = join(
    output,
    `${productName}_${version}_linux-${architecture("linux")}-portable.tar.gz`,
  );
  execFileSync("tar", ["-czf", archive, "-C", output, productName], { stdio: "inherit" });
  return archive;
}

const builders = { win32: windows, darwin: macos, linux };
const build = builders[process.platform];
if (!build) throw new Error(`portable builds are not supported on ${process.platform}`);

prepare();
const archive = build();
rmSync(staging, { recursive: true, force: true });
console.log(archive);
