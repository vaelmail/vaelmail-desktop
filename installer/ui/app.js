const tauri = window.__TAURI__;
const invoke = (command, args) =>
  tauri ? tauri.core.invoke(command, args) : Promise.reject(new Error("preview"));
const $ = (id) => document.getElementById(id);

const state = { info: null, installed: null, mode: "install" };

function show(page) {
  document.body.dataset.page = page;
}

function setProgress(percent, label) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  $("percent").textContent = String(value);
  $("meter").style.width = value + "%";
  $("status").textContent = label;
  const order = ["Preparing", "Installing", "Adding", "Finishing"];
  let active = order.findIndex((word) => label.startsWith(word));
  if (label === "Copying VaelMail" || label.startsWith("Unpacking") || label.startsWith("Moving")) active = 1;
  if (label === "Done") active = 4;
  if (active < 0) active = value < 15 ? 0 : value < 90 ? 1 : value < 98 ? 2 : 3;
  for (const item of $("steps").children) {
    const index = Number(item.dataset.step);
    item.dataset.state = index < active ? "done" : index === active ? "active" : "";
  }
}

function describe(info) {
  $("version").textContent = "version " + info.version;
  const update = Boolean(info.installed);
  $("eyebrow").textContent = update ? "Update" : "Welcome";
  $("welcome-title").textContent = update ? "Update VaelMail" : "Install VaelMail";
  $("install").textContent = update ? "Update" : "Install";
  $("location").value = info.defaultDir || "";
  $("location-row").hidden = info.platform === "macos";
  $("desktop-row").hidden = info.platform === "macos";
  $("autostart-row").hidden = info.platform === "macos";
  $("remove").hidden = !(update && info.platform === "linux");
  $("fallback").hidden = info.platform !== "windows";
  if (info.platform === "macos") {
    $("main-step").textContent = "Moving VaelMail to Applications";
  }
  if (!info.payload) {
    $("install").disabled = true;
    $("install").title = "This build has no app inside it";
  }
}

async function run(kind) {
  state.mode = kind;
  $("progress-eyebrow").textContent = kind === "remove" ? "Removing" : state.info?.installed ? "Updating" : "Installing";
  setProgress(0, "Preparing");
  show("progress");
  try {
    if (kind === "remove") {
      await invoke("setup_uninstall");
      $("done-title").textContent = "VaelMail was removed";
      $("done-text").textContent = "Your mail stays safe on the server. Install VaelMail again any time.";
      $("open").hidden = true;
      state.installed = null;
    } else {
      state.installed = await invoke("setup_install", {
        options: {
          dir: $("location-row").hidden ? null : $("location").value || null,
          desktop: $("desktop").checked,
          autostart: $("autostart").checked,
        },
      });
      $("done-title").textContent = state.info?.installed ? "VaelMail is up to date" : "VaelMail is ready";
      $("open").hidden = false;
      if ($("launch").checked) {
        await invoke("setup_launch", { path: state.installed }).catch(() => undefined);
        setTimeout(() => invoke("setup_close"), 1400);
      }
    }
    setProgress(100, "Done");
    setTimeout(() => show("done"), 350);
  } catch (error) {
    $("error-text").textContent = typeof error === "string" ? error : error?.message || "Something went wrong.";
    show("error");
  }
}

async function start() {
  if (tauri) {
    tauri.event.listen("setup:progress", (event) => setProgress(event.payload.percent, event.payload.label));
  }
  try {
    state.info = await invoke("setup_info");
  } catch {
    state.info = { platform: "windows", version: "preview", defaultDir: "C:\\Users\\you\\AppData\\Local\\Programs\\VaelMail", installed: null, payload: true };
  }
  describe(state.info);
  const preview = new URLSearchParams(location.search).get("page");
  if (preview) {
    if (preview === "progress") setProgress(62, "Installing VaelMail");
    show(preview);
  }
}

$("minimize").addEventListener("click", () => tauri?.window.getCurrentWindow().minimize());
$("close").addEventListener("click", () => {
  if (document.body.dataset.page === "progress") return;
  invoke("setup_close");
});
$("cancel").addEventListener("click", () => invoke("setup_close"));
$("finish").addEventListener("click", () => invoke("setup_close"));
$("give-up").addEventListener("click", () => invoke("setup_close"));
$("install").addEventListener("click", () => run("install"));
$("retry").addEventListener("click", () => run(state.mode));
$("remove").addEventListener("click", () => run("remove"));
$("fallback").addEventListener("click", () => invoke("setup_fallback"));
$("open").addEventListener("click", async () => {
  if (state.installed) await invoke("setup_launch", { path: state.installed }).catch(() => undefined);
  invoke("setup_close");
});
$("choose").addEventListener("click", async () => {
  const chosen = await invoke("setup_choose_dir", { current: $("location").value || null }).catch(() => null);
  if (chosen) $("location").value = chosen;
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && document.body.dataset.page === "welcome" && !$("install").disabled) run("install");
  if (event.key === "Escape" && document.body.dataset.page !== "progress") invoke("setup_close");
});

start();
