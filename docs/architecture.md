# Architecture

## Layers

1. **Interface** (`src`): the Vael98 desktop shell, a window manager and the applications. State lives
   in React Query for mail data and in small zustand stores for the shell.
2. **Bridge** (`src/lib/bridge`): typed wrappers around Tauri commands and events. One tagged error
   type separates transport failures from HTTP responses.
3. **Rust core** (`crates/vael-client`): everything that touches the network.
4. **Store** (`crates/vael-store`): keychain secrets, the SQLCipher cache, draft recovery and desktop
   settings.
5. **Application** (`src-tauri`): command handlers, custom protocols, tray, badge, notifications,
   deep links and the updater.

## Why the webview has no network access

VaelMail authenticates browsers with a host-only cookie and requires the request origin to be exactly
`https://vaelmail.com`. A webview served from a custom scheme cannot satisfy that, and a page
that could would also be able to leak mail. The Rust core sends the required headers itself and the
Content Security Policy forbids every other connection.

## Requests

`api_request` prefers the realtime WebSocket for allowlisted routes because that channel carries the
replay-safe operation id. Anything the socket cannot carry falls back to HTTPS. Writes are never
replayed automatically; an unconfirmed write surfaces as `operation_uncertain`.

## Realtime

The socket runs in Rust for the whole signed-in session, including while the window is hidden. A
snapshot updates the tray badge and triggers notifications, then is forwarded to the interface, which
applies it to its query cache. When the socket is down the core polls over HTTPS instead.

## Message rendering

Sanitized message HTML is published to Rust and loaded in a sandboxed frame from the
`vaelframe://` scheme. The document carries its own Content Security Policy, so it does not inherit
the application policy. Remote images are fetched by Rust after the user grants them and handed to the
frame as data URLs.

## Offline cache

Recent mail lists, threads and account data are written to a SQLCipher database keyed by a random
secret in the system keychain. An encrypted mailbox is not cached unless the user opts in. The cache
is deleted on sign-out, session end and account deletion. Without a keychain the cache is disabled and
the session lives in memory only.

## Passkey sign-in

WebAuthn assertions are bound to vaelmail.com, so the app hands the ceremony to the browser. After
`start` reports a passkey, `session_passkey_start` sends `{action:"desktop-handoff"}` with the pending
login cookie. The API stores a browser capability and a redeem capability in Redis for five minutes,
bound to a hash of that cookie, and returns both with a six-digit code. Rust keeps the redeem
capability and opens `https://vaelmail.com/desktop/passkey#<browser capability>`. The page shows the
code, runs the assertion and finishes the pending login on the server. The app polls
`/api/desktop/handoff` with the redeem capability; the API answers with the session cookie only when
the binding matches, so a leaked link alone cannot sign anyone in.

Sensitive changes use the same handoff with kind `action`. The app posts the change it is about to
make to `/api/account/desktop-passkey`, which returns a passkey ceremony bound to this session and
to a hash of that exact request. The browser signs it and the app polls with `kind: "action"`,
receiving the proof only when its session matches. The frontend does this transparently: any POST
whose `factor` is `@passkey` is rewritten by `src/lib/bridge/passkey.ts` and the code is shown by
`src/shell/passkey-prompt.tsx`.

## Notifications

`src-tauri/src/notify.rs` shows notifications through `notify-rust` and waits for the response on
a background thread, so a click opens the window and the thread it is about (toast activation on
Windows, the `default` action on Linux, the delegate callback on macOS).

## Offline sending

When the network is down, sending stores the draft as a recovery record with an `:outbox:` key
instead of failing. `OutboxRunner` replays the save, prepare and send steps once the connection is
back, with the record key as the idempotency key. A draft that changed elsewhere, or needs a file
decision, is reopened for review instead of being sent.

## Portable mode

`src-tauri/src/portable.rs` looks for `VaelMail.portable` next to the executable, the AppImage or the
`.app` bundle. When present, settings, data, logs and the web view profile move into `VaelMail Data`
beside it, secrets go to a file there instead of the keychain, window state is not persisted, and
autostart, the mail handler and the updater are turned off.
