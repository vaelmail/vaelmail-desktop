#!/usr/bin/env bash
#
# VaelMail Desktop installer for Linux and macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/vaelmail/vaelmail-desktop/main/install.sh | bash
#
# Options (pass them after "bash -s --" when piping):
#   -y, --yes          install with the defaults, no questions
#   --appimage         Linux: install the AppImage into your home folder
#   --package          Linux: install the .deb or .rpm with your package manager
#   --uninstall        remove VaelMail
#   --purge            with --uninstall, also remove settings, cache and saved sign-in
#   --no-launch        don't open VaelMail when done
#   -h, --help         show this help

{

set -u

REPO="vaelmail/vaelmail-desktop"
PRODUCT="VaelMail"
BINARY="vaelmail-desktop"
IDENTIFIER="com.vaelmail.desktop"
DOWNLOAD="https://github.com/${REPO}/releases/latest/download"
RAW="https://raw.githubusercontent.com/${REPO}/main"

OPT_YES=0
OPT_METHOD=""
OPT_UNINSTALL=0
OPT_PURGE=0
OPT_LAUNCH=1

WORK=""
LOG=""
TTY_FD=""
INTERACTIVE=0

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -y|--yes) OPT_YES=1 ;;
      --appimage) OPT_METHOD="appimage" ;;
      --package) OPT_METHOD="package" ;;
      --uninstall) OPT_UNINSTALL=1 ;;
      --purge) OPT_PURGE=1 ;;
      --no-launch) OPT_LAUNCH=0 ;;
      -h|--help) usage; exit 0 ;;
      *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done
}

usage() {
  cat <<EOF
VaelMail Desktop installer

  curl -fsSL ${RAW}/install.sh | bash
  curl -fsSL ${RAW}/install.sh | bash -s -- [options]

Options:
  -y, --yes       install with the defaults, no questions
  --appimage      Linux: install the AppImage into your home folder
  --package       Linux: install the .deb or .rpm with your package manager
  --uninstall     remove VaelMail
  --purge         with --uninstall, also remove settings, cache and saved sign-in
  --no-launch     don't open VaelMail when done
  -h, --help      show this help
EOF
}


setup_style() {
  local utf=0
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *UTF-8*|*utf8*|*UTF8*|*utf-8*) utf=1 ;; esac
  [ "$(uname -s)" = "Darwin" ] && utf=1

  if [ -t 2 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
    if [ "${COLORTERM:-}" = "truecolor" ] || [ "${COLORTERM:-}" = "24bit" ] || [ "${TERM_PROGRAM:-}" = "iTerm.app" ]; then
      C_ACCENT=$'\033[38;2;185;215;120m'
      C_SOFT=$'\033[38;2;232;237;228m'
      C_DIM=$'\033[38;2;120;138;128m'
      C_LOGO=$'\033[38;2;214;201;168m'
    else
      C_ACCENT=$'\033[38;5;149m'
      C_SOFT=$'\033[38;5;255m'
      C_DIM=$'\033[38;5;244m'
      C_LOGO=$'\033[38;5;187m'
    fi
    C_RED=$'\033[38;5;203m'
    C_YELLOW=$'\033[38;5;221m'
    C_BOLD=$'\033[1m'
    C_RESET=$'\033[0m'
    COLOR=1
  else
    C_ACCENT="" C_SOFT="" C_DIM="" C_LOGO="" C_RED="" C_YELLOW="" C_BOLD="" C_RESET=""
    COLOR=0
  fi

  if [ "$utf" = 1 ]; then
    G_OK="✓" G_FAIL="✗" G_WARN="!" G_DOT="·" G_ON="◉" G_OFF="○" G_BOX_ON="■" G_BOX_OFF="□"
    G_BAR_FULL="━" G_BAR_EMPTY="─" G_LINE="─" G_UPDOWN="↑↓"
    SPIN=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  else
    G_OK="+" G_FAIL="x" G_WARN="!" G_DOT="-" G_ON="(*)" G_OFF="( )" G_BOX_ON="[x]" G_BOX_OFF="[ ]"
    G_BAR_FULL="#" G_BAR_EMPTY="-" G_LINE="-" G_UPDOWN="up/down"
    SPIN=("|" "/" "-" "\\")
  fi
  UTF=$utf
}

out() { printf '%s\n' "$*" >&2; }
say() { printf '  %s\n' "$*" >&2; }
ok() { printf '  %s%s%s %s\n' "$C_ACCENT" "$G_OK" "$C_RESET" "$*" >&2; }
warn() { printf '  %s%s%s %s\n' "$C_YELLOW" "$G_WARN" "$C_RESET" "$*" >&2; }
fail() { printf '  %s%s%s %s\n' "$C_RED" "$G_FAIL" "$C_RESET" "$*" >&2; }
dim() { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_RESET" >&2; }

die() {
  out ""
  fail "$*"
  if [ -n "$LOG" ] && [ -s "$LOG" ]; then
    out ""
    dim "Last lines of the log:"
    tail -n 12 "$LOG" | while IFS= read -r line; do dim "  $line"; done
  fi
  out ""
  exit 1
}

rule() {
  local width=58 line=""
  while [ ${#line} -lt $width ]; do line="${line}${G_LINE}"; done
  printf '  %s%s%s\n' "$C_DIM" "$line" "$C_RESET" >&2
}

banner() {
  out ""
  if [ "$UTF" = 1 ]; then
    printf '  %s██%s    %s██%s   %s%sVaelMail Desktop%s\n' "$C_LOGO" "$C_RESET" "$C_SOFT" "$C_RESET" "$C_BOLD" "$C_SOFT" "$C_RESET" >&2
    printf '   %s██%s  %s██%s    %sprivate email, at home%s\n' "$C_LOGO" "$C_RESET" "$C_SOFT" "$C_RESET" "$C_ACCENT" "$C_RESET" >&2
    printf '    %s██%s%s██%s\n' "$C_LOGO" "$C_RESET" "$C_SOFT" "$C_RESET" >&2
    printf '     %s██%s\n' "$C_SOFT" "$C_RESET" >&2
  else
    printf '  %s%sVaelMail Desktop%s\n' "$C_BOLD" "$C_SOFT" "$C_RESET" >&2
    printf '  %sprivate email, at home%s\n' "$C_ACCENT" "$C_RESET" >&2
  fi
  out ""
}

row() {
  printf '  %s%-11s%s %s\n' "$C_DIM" "$1" "$C_RESET" "$2" >&2
}


setup_tty() {
  if [ "$OPT_YES" = 1 ]; then
    INTERACTIVE=0
    return
  fi
  if [ -t 2 ] && { exec 3</dev/tty; } 2>/dev/null; then
    TTY_FD=3
    INTERACTIVE=1
  else
    INTERACTIVE=0
  fi
}

cursor_hide() { [ "$COLOR" = 1 ] && printf '\033[?25l' >&2; return 0; }
cursor_show() { [ "$COLOR" = 1 ] && printf '\033[?25h' >&2; return 0; }

read_key() {
  local key rest
  IFS= read -rsn1 key <&3 || { KEY="quit"; return; }
  case "$key" in
    $'\033')
      IFS= read -rsn2 rest <&3 || rest=""
      case "$rest" in
        "[A"|"OA") KEY="up" ;;
        "[B"|"OB") KEY="down" ;;
        *) KEY="esc" ;;
      esac
      ;;
    "") KEY="enter" ;;
    " ") KEY="space" ;;
    k|K) KEY="up" ;;
    j|J) KEY="down" ;;
    q|Q) KEY="quit" ;;
    y|Y) KEY="yes" ;;
    n|N) KEY="no" ;;
    *) KEY="other" ;;
  esac
}

choose() {
  local question="$1" selected="$2"
  shift 2
  local items=("$@") count=$# i label hint first=1

  if [ "$INTERACTIVE" != 1 ]; then
    CHOICE=$selected
    return
  fi

  printf '  %s%s%s\n' "$C_BOLD" "$question" "$C_RESET" >&2
  cursor_hide
  while :; do
    if [ $first = 0 ]; then printf '\033[%dA' "$count" >&2; fi
    first=0
    for ((i = 0; i < count; i++)); do
      label="${items[$i]%%|*}"
      hint=""
      case "${items[$i]}" in *"|"*) hint="${items[$i]#*|}" ;; esac
      printf '\r\033[2K' >&2
      if [ "$i" = "$selected" ]; then
        printf '  %s%s %s%s%s' "$C_ACCENT" "$G_ON" "$C_SOFT$C_BOLD" "$label" "$C_RESET" >&2
      else
        printf '  %s%s %s%s' "$C_DIM" "$G_OFF" "$label" "$C_RESET" >&2
      fi
      [ -n "$hint" ] && printf '  %s%s%s' "$C_DIM" "$hint" "$C_RESET" >&2
      printf '\n' >&2
    done
    read_key
    case "$KEY" in
      up) selected=$(( (selected + count - 1) % count )) ;;
      down) selected=$(( (selected + 1) % count )) ;;
      enter|space) break ;;
      quit|esc) cursor_show; out ""; say "Cancelled. Nothing was changed."; out ""; exit 130 ;;
    esac
  done
  cursor_show
  CHOICE=$selected
  out ""
}

toggles() {
  local question="$1"
  shift
  local count=$# i first=1 cursor=0 state label hint rest
  local states=() labels=() hints=()
  for item in "$@"; do
    state="${item%%|*}"
    rest="${item#*|}"
    label="${rest%%|*}"
    hint=""
    case "$rest" in *"|"*) hint="${rest#*|}" ;; esac
    if [ "$state" = "on" ]; then states+=(1); else states+=(0); fi
    labels+=("$label")
    hints+=("$hint")
  done

  if [ "$INTERACTIVE" = 1 ]; then
    printf '  %s%s%s  %s%s move  space toggle  enter continue%s\n' "$C_BOLD" "$question" "$C_RESET" "$C_DIM" "$G_UPDOWN" "$C_RESET" >&2
    cursor_hide
    while :; do
      if [ $first = 0 ]; then printf '\033[%dA' "$count" >&2; fi
      first=0
      for ((i = 0; i < count; i++)); do
        printf '\r\033[2K' >&2
        local box="$G_BOX_OFF" color="$C_DIM"
        [ "${states[$i]}" = 1 ] && box="$G_BOX_ON" && color="$C_ACCENT"
        if [ "$i" = "$cursor" ]; then
          printf '  %s%s%s %s%s%s%s' "$color" "$box" "$C_RESET" "$C_SOFT" "$C_BOLD" "${labels[$i]}" "$C_RESET" >&2
        else
          printf '  %s%s%s %s' "$color" "$box" "$C_RESET" "${labels[$i]}" >&2
        fi
        [ -n "${hints[$i]}" ] && printf '  %s%s%s' "$C_DIM" "${hints[$i]}" "$C_RESET" >&2
        printf '\n' >&2
      done
      read_key
      case "$KEY" in
        up) cursor=$(( (cursor + count - 1) % count )) ;;
        down) cursor=$(( (cursor + 1) % count )) ;;
        space) states[cursor]=$(( 1 - states[cursor] )) ;;
        enter) break ;;
        quit|esc) cursor_show; out ""; say "Cancelled. Nothing was changed."; out ""; exit 130 ;;
      esac
    done
    cursor_show
    out ""
  fi
  TOGGLES="${states[*]}"
}

SPIN_PID=""

spin_start() {
  local label="$1"
  if [ "$COLOR" != 1 ]; then
    printf '  %s %s\n' "$G_DOT" "$label" >&2
    return
  fi
  cursor_hide
  (
    local i=0 n=${#SPIN[@]}
    while :; do
      printf '\r\033[2K  %s%s%s %s' "$C_ACCENT" "${SPIN[$((i % n))]}" "$C_RESET" "$label" >&2
      i=$((i + 1))
      sleep 0.08
    done
  ) &
  SPIN_PID=$!
}

spin_stop() {
  if [ -n "$SPIN_PID" ]; then
    kill "$SPIN_PID" 2>/dev/null
    wait "$SPIN_PID" 2>/dev/null
    SPIN_PID=""
    printf '\r\033[2K' >&2
    cursor_show
  fi
}

step() {
  local label="$1"
  shift
  printf '\n$ %s\n' "$*" >>"$LOG"
  spin_start "$label"
  if "$@" >>"$LOG" 2>&1; then
    spin_stop
    ok "$label"
    return 0
  fi
  spin_stop
  fail "$label"
  return 1
}

human_size() {
  awk -v b="$1" 'BEGIN { if (b >= 1048576) printf "%.1f MB", b / 1048576; else printf "%d KB", b / 1024 }'
}

file_size() {
  if [ -f "$1" ]; then wc -c <"$1" | tr -d ' '; else echo 0; fi
}

download() {
  local url="$1" file="$2" label="$3" headers="$WORK/headers"
  : >"$headers"
  printf '\n$ curl %s\n' "$url" >>"$LOG"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -sS -D "$headers" -o "$file" "$url" 2>>"$LOG" &
  local pid=$! total=0 now width=28 filled i=0 n=${#SPIN[@]}

  if [ "$COLOR" = 1 ]; then cursor_hide; else printf '  %s %s\n' "$G_DOT" "$label" >&2; fi
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$COLOR" = 1 ]; then
      if [ "$total" = 0 ]; then
        total=$(tr -d '\r' <"$headers" 2>/dev/null | awk 'tolower($1) == "content-length:" { v = $2 } END { print v + 0 }')
        [ "$total" -lt 1048576 ] && total=0
      fi
      now=$(file_size "$file")
      if [ "$total" -gt 0 ]; then
        filled=$(( now * width / total ))
        [ $filled -gt $width ] && filled=$width
        local done_bar="" todo_bar="" j
        for ((j = 0; j < width; j++)); do
          if [ $j -lt $filled ]; then done_bar="${done_bar}${G_BAR_FULL}"; else todo_bar="${todo_bar}${G_BAR_EMPTY}"; fi
        done
        printf '\r\033[2K  %s%s%s %s  %s%s%s%s%s  %s%3d%%  %s%s' \
          "$C_ACCENT" "${SPIN[$((i % n))]}" "$C_RESET" "$label" \
          "$C_ACCENT" "$done_bar" "$C_DIM" "$todo_bar" "$C_RESET" \
          "$C_DIM" $(( now * 100 / total )) "$(human_size "$now")" "$C_RESET" >&2
      else
        printf '\r\033[2K  %s%s%s %s  %s%s%s' "$C_ACCENT" "${SPIN[$((i % n))]}" "$C_RESET" "$label" "$C_DIM" "$(human_size "$now")" "$C_RESET" >&2
      fi
      i=$((i + 1))
    fi
    sleep 0.1
  done
  wait "$pid"
  local status=$?
  if [ "$COLOR" = 1 ]; then printf '\r\033[2K' >&2; cursor_show; fi
  if [ $status -ne 0 ] || [ ! -s "$file" ]; then
    fail "$label"
    return 1
  fi
  ok "$label  ${C_DIM}$(human_size "$(file_size "$file")")${C_RESET}"
}


need() {
  command -v "$1" >/dev/null 2>&1 || die "This installer needs '$1', which isn't installed."
}

cleanup() {
  spin_stop
  cursor_show
  [ -n "$WORK" ] && rm -rf "$WORK"
  return 0
}

on_interrupt() {
  spin_stop
  cursor_show
  out ""
  out ""
  say "Stopped."
  out ""
  exit 130
}

latest_version() {
  local url
  url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" 2>/dev/null) || return 1
  case "$url" in
    */tag/v*) printf '%s\n' "${url##*/tag/v}" ;;
    *) return 1 ;;
  esac
}

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

need_root() {
  [ "$(id -u)" = 0 ] && return 0
  command -v sudo >/dev/null 2>&1 || die "Installing a system package needs sudo. Run again with --appimage to install into your home folder instead."
  sudo -n true 2>/dev/null && return 0
  say "${C_DIM}Your password is needed to install a system package.${C_RESET}"
  if [ -n "$TTY_FD" ]; then
    sudo -v <&3 || die "Couldn't get administrator rights."
  else
    sudo -v || die "Couldn't get administrator rights."
  fi
  out ""
}

pretty_path() {
  case "$1" in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

has_display() {
  [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ] || [ "$(uname -s)" = "Darwin" ]
}


linux_detect() {
  DISTRO_NAME="Linux"
  DISTRO_ID=""
  DISTRO_LIKE=""
  if [ -r /etc/os-release ]; then
    DISTRO_NAME=$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-${NAME:-Linux}}")
    DISTRO_ID=$(. /etc/os-release && printf '%s' "${ID:-}")
    DISTRO_LIKE=$(. /etc/os-release && printf '%s' "${ID_LIKE:-}")
  fi

  case "$(uname -m)" in
    x86_64|amd64) ARCH="x64" ARCH_LABEL="x86_64" ;;
    aarch64|arm64) ARCH="arm64" ARCH_LABEL="arm64" ;;
    *) die "VaelMail is built for x86_64 and arm64. This machine is $(uname -m)." ;;
  esac

  PKG=""
  PKG_KIND=""
  if [ -e /run/ostree-booted ]; then
    PKG=""
  elif command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
    PKG="apt" PKG_KIND="deb"
  elif command -v dnf >/dev/null 2>&1; then
    PKG="dnf" PKG_KIND="rpm"
  elif command -v zypper >/dev/null 2>&1; then
    PKG="zypper" PKG_KIND="rpm"
  elif command -v yum >/dev/null 2>&1; then
    PKG="yum" PKG_KIND="rpm"
  fi

  DESKTOP="${XDG_CURRENT_DESKTOP:-${DESKTOP_SESSION:-}}"
  SESSION="${XDG_SESSION_TYPE:-}"
  [ -z "$SESSION" ] && [ -n "${WAYLAND_DISPLAY:-}" ] && SESSION="wayland"
  [ -z "$SESSION" ] && [ -n "${DISPLAY:-}" ] && SESSION="x11"

  DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
  CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
  CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
  APP_DIR="$DATA_HOME/vaelmail"
  APPIMAGE_PATH="$APP_DIR/$PRODUCT.AppImage"
  LAUNCHER="$APP_DIR/vaelmail"
  DESKTOP_FILE="$DATA_HOME/applications/$PRODUCT.desktop"
  ICON_FILE="$DATA_HOME/icons/hicolor/256x256/apps/vaelmail.png"
  AUTOSTART_FILE="$CONFIG_HOME/autostart/$PRODUCT.desktop"

  INSTALLED_APPIMAGE=0
  [ -f "$APPIMAGE_PATH" ] && INSTALLED_APPIMAGE=1

  INSTALLED_PACKAGE=""
  INSTALLED_PACKAGE_VERSION=""
  if [ -e "/usr/bin/$BINARY" ]; then
    if command -v dpkg >/dev/null 2>&1; then
      INSTALLED_PACKAGE=$(dpkg -S "/usr/bin/$BINARY" 2>/dev/null | head -n1 | cut -d: -f1)
      [ -n "$INSTALLED_PACKAGE" ] && INSTALLED_PACKAGE_VERSION=$(dpkg-query -W -f '${Version}' "$INSTALLED_PACKAGE" 2>/dev/null)
    fi
    if [ -z "$INSTALLED_PACKAGE" ] && command -v rpm >/dev/null 2>&1; then
      INSTALLED_PACKAGE=$(rpm -qf --qf '%{NAME}' "/usr/bin/$BINARY" 2>/dev/null) || INSTALLED_PACKAGE=""
      [ -n "$INSTALLED_PACKAGE" ] && INSTALLED_PACKAGE_VERSION=$(rpm -q --qf '%{VERSION}' "$INSTALLED_PACKAGE" 2>/dev/null)
    fi
  fi

  FUSE=0
  if ls /usr/lib*/libfuse.so.2* /usr/lib/*/libfuse.so.2* /lib*/libfuse.so.2* /lib/*/libfuse.so.2* >/dev/null 2>&1; then
    FUSE=1
  elif command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    FUSE=1
  fi

  NIXOS=0
  [ "$DISTRO_ID" = "nixos" ] && NIXOS=1
}

fuse_package() {
  case "$PKG" in
    apt)
      if apt-cache show libfuse2t64 >/dev/null 2>&1; then echo "libfuse2t64"; else echo "libfuse2"; fi
      ;;
    dnf|yum) echo "fuse-libs" ;;
    zypper) echo "libfuse2" ;;
    *)
      case "$DISTRO_ID $DISTRO_LIKE" in
        *arch*) echo "fuse2" ;;
        *alpine*) echo "fuse" ;;
        *) echo "libfuse2" ;;
      esac
      ;;
  esac
}

linux_summary() {
  row "System" "$DISTRO_NAME ${C_DIM}${G_DOT} $ARCH_LABEL${C_RESET}"
  local desktop_line="${DESKTOP:-${C_DIM}no graphical session${C_RESET}}"
  [ -n "$SESSION" ] && desktop_line="$desktop_line ${C_DIM}${G_DOT} $SESSION${C_RESET}"
  row "Desktop" "$desktop_line"
  if [ -n "$PKG" ]; then row "Packages" "$PKG ${C_DIM}(.${PKG_KIND})${C_RESET}"; else row "Packages" "${C_DIM}AppImage only on this system${C_RESET}"; fi
  local installed="${C_DIM}not installed${C_RESET}"
  if [ -n "$INSTALLED_PACKAGE" ] && [ "$INSTALLED_APPIMAGE" = 1 ]; then
    installed="${C_YELLOW}two copies${C_RESET} ${C_DIM}(package $INSTALLED_PACKAGE_VERSION and AppImage)${C_RESET}"
  elif [ -n "$INSTALLED_PACKAGE" ]; then
    installed="package $INSTALLED_PACKAGE_VERSION ${C_DIM}($INSTALLED_PACKAGE)${C_RESET}"
  elif [ "$INSTALLED_APPIMAGE" = 1 ]; then
    installed="AppImage ${C_DIM}in $(pretty_path "$APP_DIR")${C_RESET}"
  fi
  row "Installed" "$installed"
  row "Latest" "${VERSION:-${C_DIM}unknown${C_RESET}}"
  out ""
}

linux_running() {
  pgrep -x "$BINARY" >/dev/null 2>&1 || pgrep -f "$APP_DIR/$PRODUCT.AppImage" >/dev/null 2>&1
}

linux_close_app() {
  linux_running || return 0
  warn "VaelMail is running and will be closed."
  pkill -x "$BINARY" 2>/dev/null
  pkill -f "$APP_DIR/$PRODUCT.AppImage" 2>/dev/null
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    linux_running || return 0
    sleep 0.5
  done
  pkill -9 -x "$BINARY" 2>/dev/null
  pkill -9 -f "$APP_DIR/$PRODUCT.AppImage" 2>/dev/null
  return 0
}

linux_refresh_desktop() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" >/dev/null 2>&1
  touch "$DATA_HOME/icons/hicolor" 2>/dev/null
  command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1
  command -v kbuildsycoca5 >/dev/null 2>&1 && kbuildsycoca5 >/dev/null 2>&1
  return 0
}

desktop_quote() {
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/`/\\`/g' -e 's/\$/\\$/g')"
}

linux_write_launcher() {
  mkdir -p "$APP_DIR" || return 1
  {
    printf '#!/bin/sh\n'
    if [ "$NIXOS" = 1 ]; then
      printf 'exec appimage-run %s "$@"\n' "$(desktop_quote "$APPIMAGE_PATH")"
    elif [ "$FUSE" = 1 ]; then
      printf 'exec %s "$@"\n' "$(desktop_quote "$APPIMAGE_PATH")"
    else
      printf 'APPIMAGE_EXTRACT_AND_RUN=1 exec %s "$@"\n' "$(desktop_quote "$APPIMAGE_PATH")"
    fi
  } >"$LAUNCHER" && chmod 755 "$LAUNCHER"
}

linux_write_desktop_entry() {
  mkdir -p "$(dirname "$DESKTOP_FILE")" || return 1
  local icon="vaelmail"
  [ -f "$ICON_FILE" ] || icon="mail-client"
  cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=$PRODUCT
GenericName=Email
Comment=Private email, at home
Exec=$(desktop_quote "$LAUNCHER") %u
TryExec=$LAUNCHER
Icon=$icon
Terminal=false
Categories=Network;Email;Office;
Keywords=mail;email;vael;
MimeType=x-scheme-handler/mailto;
StartupNotify=true
StartupWMClass=$BINARY
EOF
}

linux_write_autostart() {
  local exec_line="$1"
  mkdir -p "$(dirname "$AUTOSTART_FILE")" || return 1
  cat >"$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$PRODUCT
Comment=$PRODUCT startup script
Exec=$exec_line --hidden
StartupNotify=false
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
}

linux_install_icon() {
  mkdir -p "$(dirname "$ICON_FILE")" || return 1
  curl -fsSL --retry 2 -o "$ICON_FILE.part" "$RAW/src-tauri/icons/128x128@2x.png" && mv "$ICON_FILE.part" "$ICON_FILE"
}

linux_set_mail_handler() {
  local entry="$1"
  command -v xdg-mime >/dev/null 2>&1 || return 1
  xdg-mime default "$entry" x-scheme-handler/mailto
}

linux_remove_appimage() {
  rm -f "$APPIMAGE_PATH" "$LAUNCHER" "$DESKTOP_FILE" "$ICON_FILE"
  rmdir "$APP_DIR" 2>/dev/null
  linux_refresh_desktop
  return 0
}

linux_package_install() {
  local file="$1"
  case "$PKG" in
    apt) as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades "$file" ;;
    dnf) as_root dnf install -y "$file" ;;
    yum) as_root yum install -y "$file" ;;
    zypper) as_root zypper --non-interactive install --allow-unsigned-rpm --force "$file" ;;
    *) return 1 ;;
  esac
}

linux_package_remove() {
  local name="$1"
  if command -v dpkg >/dev/null 2>&1 && dpkg -s "$name" >/dev/null 2>&1; then
    as_root env DEBIAN_FRONTEND=noninteractive apt-get remove -y "$name"
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf remove -y "$name"
  elif command -v zypper >/dev/null 2>&1; then
    as_root zypper --non-interactive remove "$name"
  elif command -v yum >/dev/null 2>&1; then
    as_root yum remove -y "$name"
  else
    as_root rpm -e "$name"
  fi
}

linux_purge_data() {
  local runner=""
  if [ -x "$LAUNCHER" ]; then runner="$LAUNCHER"; elif [ -x "/usr/bin/$BINARY" ]; then runner="/usr/bin/$BINARY"; fi
  if [ -n "$runner" ]; then
    if command -v timeout >/dev/null 2>&1; then
      timeout 20 "$runner" --purge-secrets "$DATA_HOME/$IDENTIFIER" >/dev/null 2>&1
    else
      "$runner" --purge-secrets "$DATA_HOME/$IDENTIFIER" >/dev/null 2>&1
    fi
  fi
  rm -rf "${DATA_HOME:?}/$IDENTIFIER" "${CONFIG_HOME:?}/$IDENTIFIER" "${CACHE_HOME:?}/$IDENTIFIER" \
    "${DATA_HOME:?}/$BINARY" "${CACHE_HOME:?}/$BINARY"
  rm -f "$AUTOSTART_FILE"
  return 0
}

linux_uninstall() {
  if [ -z "$INSTALLED_PACKAGE" ] && [ "$INSTALLED_APPIMAGE" = 0 ]; then
    say "VaelMail isn't installed. Nothing to remove."
    out ""
    exit 0
  fi

  local purge=$OPT_PURGE
  if [ "$INTERACTIVE" = 1 ] && [ "$purge" = 0 ]; then
    toggles "Remove VaelMail" \
      "off|Also remove settings, offline cache and saved sign-in|your mailbox on the service isn't touched"
    purge=$TOGGLES
  fi

  [ -n "$INSTALLED_PACKAGE" ] && need_root
  linux_close_app

  if [ "$purge" = 1 ]; then
    step "Forgetting the saved sign-in and removing local data" linux_purge_data
  fi
  if [ "$INSTALLED_APPIMAGE" = 1 ]; then
    step "Removing the AppImage and its menu entry" linux_remove_appimage || die "Couldn't remove the AppImage."
  fi
  if [ -n "$INSTALLED_PACKAGE" ]; then
    step "Removing the $INSTALLED_PACKAGE package" linux_package_remove "$INSTALLED_PACKAGE" || die "Couldn't remove the package."
  fi
  rm -f "$AUTOSTART_FILE"

  out ""
  ok "${C_BOLD}VaelMail was removed.${C_RESET}"
  if [ "$purge" != 1 ]; then
    dim "Your settings and offline cache were kept. Run with --uninstall --purge to remove them too."
  fi
  dim "Your mail is still waiting at vaelmail.com."
  out ""
}

linux_install() {
  if [ "$NIXOS" = 1 ] && ! command -v appimage-run >/dev/null 2>&1; then
    die "On NixOS, add appimage-run to your system (environment.systemPackages) and run this again."
  fi

  if [ -n "$INSTALLED_PACKAGE" ] || [ "$INSTALLED_APPIMAGE" = 1 ]; then
    choose "VaelMail is already installed. What should happen?" 0 \
      "Update or reinstall|keeps your settings and sign-in" \
      "Uninstall|" \
      "Cancel|"
    case "$CHOICE" in
      1) linux_uninstall; return ;;
      2) say "Nothing was changed."; out ""; exit 0 ;;
    esac
  fi

  local method="$OPT_METHOD"
  if [ "$method" = "package" ] && [ -z "$PKG" ]; then
    warn "No supported package manager here, using the AppImage."
    method="appimage"
  fi
  if [ -z "$method" ]; then
    if [ -n "$PKG" ]; then
      local default=0
      [ -n "$INSTALLED_PACKAGE" ] && [ "$INSTALLED_APPIMAGE" = 0 ] && default=1
      choose "How should VaelMail be installed?" "$default" \
        "AppImage in your home folder|no sudo, updates itself" \
        ".$PKG_KIND package with $PKG|system-wide, update by running this again"
      if [ "$CHOICE" = 1 ]; then method="package"; else method="appimage"; fi
    else
      method="appimage"
    fi
  fi

  local autostart_default="off" mailto_default="on"
  [ -f "$AUTOSTART_FILE" ] && autostart_default="on"
  local launch_state="on"
  [ "$OPT_LAUNCH" = 0 ] && launch_state="off"
  if ! has_display; then launch_state="off"; fi

  toggles "Make it yours" \
    "$autostart_default|Start VaelMail when I sign in|waits in the tray for new mail" \
    "$mailto_default|Use VaelMail for email links|opens mailto: links in a new message" \
    "$launch_state|Open VaelMail when it's installed|"
  local autostart mailto launch
  read -r autostart mailto launch <<<"$TOGGLES"

  if [ "$method" = "package" ]; then need_root; fi

  local exec_line entry="$PRODUCT.desktop"

  if [ "$method" = "appimage" ]; then
    local file="$WORK/$PRODUCT.AppImage"
    download "$DOWNLOAD/VaelMail-linux-${ARCH}.AppImage" "$file" "Downloading VaelMail${VERSION:+ $VERSION}" \
      || die "The download failed. Check your connection and try again."
    linux_close_app
    if [ -n "$INSTALLED_PACKAGE" ]; then
      need_root
      step "Removing the old $INSTALLED_PACKAGE package" linux_package_remove "$INSTALLED_PACKAGE" \
        || warn "Couldn't remove the old package. You may see VaelMail twice in your menu."
    fi
    step "Installing into $(pretty_path "$APP_DIR")" sh -c 'mkdir -p "$1" && chmod 755 "$2" && mv -f "$2" "$3"' _ "$APP_DIR" "$file" "$APPIMAGE_PATH" \
      || die "Couldn't install VaelMail into $APP_DIR."
    linux_write_launcher || die "Couldn't write the launcher."
    linux_install_icon >>"$LOG" 2>&1 || true
    step "Adding VaelMail to your app menu" linux_write_desktop_entry || warn "Couldn't add the menu entry."
    linux_refresh_desktop
    exec_line=$(desktop_quote "$LAUNCHER")
  else
    local file="$WORK/VaelMail.${PKG_KIND}"
    download "$DOWNLOAD/VaelMail-linux-${ARCH}.${PKG_KIND}" "$file" "Downloading VaelMail${VERSION:+ $VERSION}" \
      || die "The download failed. Check your connection and try again."
    chmod 644 "$file"
    linux_close_app
    if [ "$INSTALLED_APPIMAGE" = 1 ]; then
      step "Removing the old AppImage" linux_remove_appimage || true
    fi
    step "Installing the .$PKG_KIND package with $PKG" linux_package_install "$file" \
      || die "The package manager couldn't install VaelMail."
    exec_line="/usr/bin/$BINARY"
    entry=$(basename "$(grep -l "Exec=.*$BINARY" /usr/share/applications/*.desktop 2>/dev/null | head -n1)" 2>/dev/null)
    [ -z "$entry" ] && entry="$PRODUCT.desktop"
  fi

  if [ "$autostart" = 1 ]; then
    step "Starting VaelMail when you sign in" linux_write_autostart "$exec_line" || true
  else
    rm -f "$AUTOSTART_FILE"
  fi

  if [ "$mailto" = 1 ]; then
    step "Opening email links with VaelMail" linux_set_mail_handler "$entry" \
      || warn "Couldn't set the mail handler. Turn it on later in VaelMail's settings."
  fi

  out ""
  rule
  ok "${C_BOLD}${C_SOFT}VaelMail${VERSION:+ $VERSION} is ready.${C_RESET}"
  dim "Sign in with your account number and pick up where you left off."
  if [ "$method" = "appimage" ]; then
    dim "It updates itself. Run this installer again any time to repair or remove it."
    if [ "$FUSE" = 0 ] && [ "$NIXOS" = 0 ]; then
      out ""
      warn "FUSE 2 isn't installed, so VaelMail unpacks itself on each start."
      dim "  For faster starts: install the $(fuse_package) package."
    fi
  else
    dim "Run this installer again to update it."
  fi
  rule
  out ""

  if [ "$launch" = 1 ] && has_display; then
    if [ "$method" = "appimage" ]; then
      (setsid "$LAUNCHER" >/dev/null 2>&1 &) 2>/dev/null || (nohup "$LAUNCHER" >/dev/null 2>&1 &)
    else
      (setsid "/usr/bin/$BINARY" >/dev/null 2>&1 &) 2>/dev/null || (nohup "/usr/bin/$BINARY" >/dev/null 2>&1 &)
    fi
  fi
}


mac_detect() {
  MAC_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "0")
  local major="${MAC_VERSION%%.*}"
  [ "${major:-0}" -ge 11 ] 2>/dev/null || die "VaelMail needs macOS 11 or later. This Mac runs $MAC_VERSION."

  if [ "$(uname -m)" = "arm64" ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = 1 ]; then
    ARCH="apple-silicon" ARCH_LABEL="Apple silicon"
  else
    ARCH="intel" ARCH_LABEL="Intel"
  fi

  MAC_APP=""
  local candidate
  for candidate in "/Applications/$PRODUCT.app" "$HOME/Applications/$PRODUCT.app"; do
    if [ -d "$candidate" ]; then MAC_APP="$candidate"; break; fi
  done
  MAC_INSTALLED_VERSION=""
  if [ -n "$MAC_APP" ]; then
    MAC_INSTALLED_VERSION=$(defaults read "$MAC_APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)
  fi

  if [ -w /Applications ]; then MAC_TARGET_DIR="/Applications"; else MAC_TARGET_DIR="$HOME/Applications"; fi
  [ -n "$MAC_APP" ] && MAC_TARGET_DIR=$(dirname "$MAC_APP")

  LAUNCH_AGENT="$HOME/Library/LaunchAgents/$PRODUCT.plist"
}

mac_summary() {
  row "System" "macOS $MAC_VERSION ${C_DIM}${G_DOT} $ARCH_LABEL${C_RESET}"
  if [ -n "$MAC_APP" ]; then
    row "Installed" "${MAC_INSTALLED_VERSION:-yes} ${C_DIM}in ${MAC_APP%/*}${C_RESET}"
  else
    row "Installed" "${C_DIM}not installed${C_RESET}"
  fi
  row "Latest" "${VERSION:-${C_DIM}unknown${C_RESET}}"
  out ""
}

mac_running() {
  pgrep -x "$BINARY" >/dev/null 2>&1
}

mac_close_app() {
  mac_running || return 0
  warn "VaelMail is running and will be closed."
  osascript -e "tell application id \"$IDENTIFIER\" to quit" >/dev/null 2>&1
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    mac_running || return 0
    sleep 0.5
  done
  pkill -x "$BINARY" 2>/dev/null
  sleep 1
  pkill -9 -x "$BINARY" 2>/dev/null
  return 0
}

mac_copy_app() {
  local dmg="$1" mount="$WORK/mount"
  mkdir -p "$mount" || return 1
  hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$mount" "$dmg" || return 1
  local source="" candidate
  for candidate in "$mount"/*.app; do
    [ -d "$candidate" ] && source="$candidate" && break
  done
  if [ -z "$source" ]; then
    hdiutil detach -quiet "$mount"
    return 1
  fi
  mkdir -p "$MAC_TARGET_DIR" || { hdiutil detach -quiet "$mount"; return 1; }
  local target="$MAC_TARGET_DIR/$PRODUCT.app"
  rm -rf "$target.new"
  if ! ditto "$source" "$target.new"; then
    hdiutil detach -quiet "$mount"
    rm -rf "$target.new"
    return 1
  fi
  hdiutil detach -quiet "$mount" || hdiutil detach -force -quiet "$mount"
  rm -rf "$target" && mv "$target.new" "$target" || return 1
  xattr -dr com.apple.quarantine "$target" 2>/dev/null
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$target" >/dev/null 2>&1
  MAC_APP="$target"
  return 0
}

mac_write_launch_agent() {
  mkdir -p "$(dirname "$LAUNCH_AGENT")" || return 1
  cat >"$LAUNCH_AGENT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PRODUCT</string>
  <key>ProgramArguments</key>
  <array>
    <string>$MAC_APP/Contents/MacOS/$BINARY</string>
    <string>--hidden</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF
}

mac_set_mail_handler() {
  osascript -l JavaScript -e "ObjC.import('CoreServices'); \$.LSSetDefaultHandlerForURLScheme(\$('mailto'), \$('$IDENTIFIER'));"
}

mac_purge_data() {
  local support="$HOME/Library/Application Support/$IDENTIFIER"
  if [ -n "$MAC_APP" ] && [ -x "$MAC_APP/Contents/MacOS/$BINARY" ]; then
    "$MAC_APP/Contents/MacOS/$BINARY" --purge-secrets "$support" >/dev/null 2>&1
  fi
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    security delete-generic-password -s vaelmail-desktop >/dev/null 2>&1 || break
  done
  rm -rf "$support" \
    "$HOME/Library/Caches/$IDENTIFIER" \
    "$HOME/Library/WebKit/$IDENTIFIER" \
    "$HOME/Library/WebKit/$BINARY" \
    "$HOME/Library/HTTPStorages/$IDENTIFIER" \
    "$HOME/Library/Logs/$IDENTIFIER" \
    "$HOME/Library/Saved Application State/$IDENTIFIER.savedState" \
    "$HOME/Library/Preferences/$IDENTIFIER.plist"
  return 0
}

mac_uninstall() {
  if [ -z "$MAC_APP" ]; then
    say "VaelMail isn't installed. Nothing to remove."
    out ""
    exit 0
  fi
  local purge=$OPT_PURGE
  if [ "$INTERACTIVE" = 1 ] && [ "$purge" = 0 ]; then
    toggles "Remove VaelMail" \
      "off|Also remove settings, offline cache and saved sign-in|your mailbox on the service isn't touched"
    purge=$TOGGLES
  fi
  mac_close_app
  if [ "$purge" = 1 ]; then
    step "Forgetting the saved sign-in and removing local data" mac_purge_data
  fi
  launchctl unload "$LAUNCH_AGENT" >/dev/null 2>&1
  rm -f "$LAUNCH_AGENT"
  step "Removing ${MAC_APP}" rm -rf "$MAC_APP" || die "Couldn't remove $MAC_APP."
  out ""
  ok "${C_BOLD}VaelMail was removed.${C_RESET}"
  [ "$purge" != 1 ] && dim "Your settings and offline cache were kept. Run with --uninstall --purge to remove them too."
  dim "Your mail is still waiting at vaelmail.com."
  out ""
}

mac_install() {
  if [ -n "$MAC_APP" ]; then
    choose "VaelMail is already installed. What should happen?" 0 \
      "Update or reinstall|keeps your settings and sign-in" \
      "Uninstall|" \
      "Cancel|"
    case "$CHOICE" in
      1) mac_uninstall; return ;;
      2) say "Nothing was changed."; out ""; exit 0 ;;
    esac
  fi

  local autostart_default="off"
  [ -f "$LAUNCH_AGENT" ] && autostart_default="on"
  local launch_state="on"
  [ "$OPT_LAUNCH" = 0 ] && launch_state="off"

  toggles "Make it yours" \
    "$autostart_default|Start VaelMail when I log in|waits in the menu bar for new mail" \
    "on|Use VaelMail for email links|opens mailto: links in a new message" \
    "$launch_state|Open VaelMail when it's installed|"
  local autostart mailto launch
  read -r autostart mailto launch <<<"$TOGGLES"

  local dmg="$WORK/VaelMail.dmg"
  download "$DOWNLOAD/VaelMail-macos-${ARCH}.dmg" "$dmg" "Downloading VaelMail${VERSION:+ $VERSION}" \
    || die "The download failed. Check your connection and try again."
  mac_close_app
  step "Installing into $MAC_TARGET_DIR" mac_copy_app "$dmg" || die "Couldn't copy VaelMail into $MAC_TARGET_DIR."

  if [ "$autostart" = 1 ]; then
    step "Starting VaelMail when you log in" mac_write_launch_agent || true
  else
    rm -f "$LAUNCH_AGENT"
  fi
  if [ "$mailto" = 1 ]; then
    step "Opening email links with VaelMail" mac_set_mail_handler \
      || warn "Couldn't set the mail handler. Turn it on later in VaelMail's settings."
  fi

  out ""
  rule
  ok "${C_BOLD}${C_SOFT}VaelMail${VERSION:+ $VERSION} is ready.${C_RESET}"
  dim "Sign in with your account number and pick up where you left off."
  dim "It updates itself. Run this installer again any time to repair or remove it."
  rule
  out ""

  [ "$launch" = 1 ] && open "$MAC_APP" >/dev/null 2>&1
  return 0
}


main() {
  parse_args "$@"
  setup_style
  setup_tty
  trap cleanup EXIT
  trap on_interrupt INT TERM

  [ "$(id -u)" = 0 ] && [ "$(uname -s)" = "Darwin" ] && die "Run this as your normal user, not with sudo."

  banner
  [ -n "${HOME:-}" ] && [ "$HOME" != "/" ] || die "HOME isn't set, so there's nowhere to install VaelMail."
  need curl

  WORK=$(mktemp -d 2>/dev/null || mktemp -d -t vaelmail) || die "Couldn't create a temporary folder."
  chmod 755 "$WORK"
  LOG="$WORK/install.log"
  : >"$LOG"

  local os
  os=$(uname -s)
  case "$os" in
    Linux) linux_detect ;;
    Darwin) mac_detect ;;
    *) die "This installer is for Linux and macOS. On Windows, use install.ps1 from the same place." ;;
  esac

  if [ "$OPT_UNINSTALL" = 0 ]; then
    VERSION=$(latest_version 2>/dev/null || true)
  else
    VERSION=""
  fi

  if [ "$os" = Linux ]; then
    [ "$(id -u)" = 0 ] && [ "$OPT_METHOD" != "package" ] && [ "$OPT_UNINSTALL" = 0 ] && \
      warn "You're running as root, so VaelMail installs for root only. Run it as your normal user instead."
    linux_summary
    if [ "$OPT_UNINSTALL" = 1 ]; then linux_uninstall; else linux_install; fi
  else
    mac_summary
    if [ "$OPT_UNINSTALL" = 1 ]; then mac_uninstall; else mac_install; fi
  fi
}

main "$@"
exit $?

}
