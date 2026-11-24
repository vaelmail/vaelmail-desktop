const tauri = window.__TAURI__;
const invoke = (command, args) =>
  tauri ? tauri.core.invoke(command, args) : Promise.reject(new Error("preview"));
const $ = (id) => document.getElementById(id);

const copy = {
  windows: {
    lead: "Setup installs VaelMail for your Windows account. It doesn't need administrator rights.",
    done: "VaelMail is in the Start menu. Sign in with your 16-digit account number.",
  },
  macos: {
    lead: "Setup copies VaelMail into your Applications folder.",
    done: "VaelMail is in Applications. Sign in with your 16-digit account number.",
  },
  linux: {
    lead: "Setup puts VaelMail in your home folder and adds it to your app menu. It doesn't need root.",
    done: "VaelMail is in your app menu. Sign in with your 16-digit account number.",
  },
};

const state = { info: null, installed: null, mode: "install" };

function show(page) {
  document.body.dataset.page = page;
  const heading = document.querySelector(`#page-${page} h1`);
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

function megabytes(bytes) {
  return bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function setProgress(percent, label) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  $("meter").style.width = value + "%";
  $("meter-box").setAttribute("aria-valuenow", String(value));
  $("percent").textContent = value + "%";
  $("status").textContent = label === "Done" ? "Finishing" : label;
}

function describe(info) {
  const text = copy[info.platform] ?? copy.windows;
  const update = Boolean(info.installed);
  $("version").textContent = info.version;
  $("welcome-title").textContent = update ? "Update VaelMail" : "Install VaelMail";
  $("lead").textContent = update
    ? "A copy of VaelMail is already installed. Setup replaces it with version " +
      info.version +
      " and keeps your settings and saved mail."
    : text.lead;
  $("install").textContent = update ? "Update" : "Install";
  $("location").textContent = info.defaultDir || "";
  $("size").textContent = info.size ? megabytes(info.size) : "Unknown";
  $("location-row").hidden = info.platform === "macos";
  $("choose").hidden = info.platform === "macos";
  $("desktop-row").hidden = info.platform === "macos";
  $("autostart-row").hidden = info.platform === "macos";
  $("remove").hidden = !(update && info.platform === "linux");
  $("fallback").hidden = info.platform !== "windows";
  $("done-text").textContent = text.done;
  if (!info.payload) {
    $("install").disabled = true;
    $("lead").textContent =
      "This copy of Setup doesn't contain VaelMail. Download it again from vaelmail.com.";
  }
}

async function run(kind) {
  state.mode = kind;
  const update = Boolean(state.info?.installed);
  $("progress-title").textContent =
    kind === "remove" ? "Removing VaelMail" : update ? "Updating VaelMail" : "Installing VaelMail";
  setProgress(0, "Preparing");
  show("progress");
  try {
    if (kind === "remove") {
      await invoke("setup_uninstall");
      $("done-title").textContent = "VaelMail was removed";
      $("done-text").textContent =
        "Your mail is still on the server. You can install VaelMail again at any time.";
      $("open").hidden = true;
      state.installed = null;
    } else {
      state.installed = await invoke("setup_install", {
        options: {
          dir: $("location-row").hidden ? null : $("location").textContent || null,
          desktop: $("desktop").checked,
          autostart: $("autostart").checked,
        },
      });
      $("done-title").textContent = update ? "VaelMail is up to date" : "VaelMail is installed";
      $("open").hidden = false;
      if ($("launch").checked) {
        await invoke("setup_launch", { path: state.installed }).catch(() => undefined);
        setTimeout(() => invoke("setup_close"), 1200);
      }
    }
    setProgress(100, "Done");
    show("done");
  } catch (error) {
    $("error-text").textContent =
      typeof error === "string" ? error : error?.message || "Something went wrong.";
    show("error");
  }
}

async function start() {
  if (tauri) {
    tauri.event.listen("setup:progress", (event) =>
      setProgress(event.payload.percent, event.payload.label),
    );
  }
  try {
    state.info = await invoke("setup_info");
  } catch {
    const platform = new URLSearchParams(location.search).get("platform") || "windows";
    state.info = {
      platform,
      version: "0.2.0",
      defaultDir: "C:\\Users\\you\\AppData\\Local\\Programs\\VaelMail",
      installed: null,
      payload: true,
      size: 10276044,
    };
  }
  describe(state.info);
  const preview = new URLSearchParams(location.search).get("page");
  if (preview) {
    if (preview === "progress") setProgress(58, "Installing VaelMail");
    if (preview === "error")
      $("error-text").textContent =
        "The installer stopped with code 2. Close VaelMail if it is running and try again.";
    show(preview);
  }
}

$("minimize").addEventListener("click", () => tauri?.window.getCurrentWindow().minimize());
$("close").addEventListener("click", () => {
  if (document.body.dataset.page !== "progress") invoke("setup_close");
});
for (const id of ["cancel", "finish", "give-up"])
  $(id).addEventListener("click", () => invoke("setup_close"));
$("install").addEventListener("click", () => run("install"));
$("retry").addEventListener("click", () => run(state.mode));
$("remove").addEventListener("click", () => run("remove"));
$("fallback").addEventListener("click", () => invoke("setup_fallback"));
$("open").addEventListener("click", async () => {
  if (state.installed)
    await invoke("setup_launch", { path: state.installed }).catch(() => undefined);
  invoke("setup_close");
});
$("choose").addEventListener("click", async () => {
  const chosen = await invoke("setup_choose_dir", {
    current: $("location").textContent || null,
  }).catch(() => null);
  if (chosen) $("location").textContent = chosen;
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.dataset.page !== "progress") invoke("setup_close");
});

start();
