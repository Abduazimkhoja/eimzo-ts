# Troubleshooting eimzo-ts

Read `error.code` first, then `error.reason` / `error.status` (raw E-IMZO data) or `error.httpStatus` (backend).

| code | Typical cause | Fix |
|---|---|---|
| `NOT_INSTALLED` | E-IMZO is not running or not installed; the WebSocket to 127.0.0.1 closed. `wsCode` has the close code. | Ask the user to start E-IMZO or install it from https://e-imzo.uz/main/downloads/. |
| `WEBSOCKET_UNSUPPORTED` | No `WebSocket` (very old browser, or code ran on the server during SSR). | Run on the client only; in Node pass `WebSocketImpl`. |
| `TIMEOUT` | `timeoutMs` is set and E-IMZO (or the user) did not answer in time. | Raise or remove `timeoutMs`. |
| `OUTDATED_VERSION` | Installed E-IMZO is older than `minVersion` (default 4.86). | Ask the user to update E-IMZO. |
| `API_KEY_REJECTED` | No valid API key for the page's domain. | `DEV_API_KEYS` for localhost; "Developer mode" in the E-IMZO tray for test domains; an issued key per production domain/subdomain. |
| `WRONG_PASSWORD` | Wrong key password. `reason` "Password is not ASCII" means a non-Latin keyboard layout. | Let the user retry. E-IMZO itself already showed a message. |
| `CANCELLED` | The user pressed "Cancel" (status -5000). | Do nothing or reset the UI. Do not show an error. |
| `KEY_NOT_FOUND` | E-IMZO forgot the `keyId` (status -1010/-1014): restart, 24 h, or unloaded. With `autoReloadKey` (default) `sign()` retries once. | Call `loadKey()` again. |
| `KEY_NOT_LOADED` | `sign`/`signFile`/`signDocument` before `loadKey()`. | Fix the calling code. `login()` loads the key itself. |
| `FILE_TOO_LARGE` | File larger than `maxSize` (10 MB default). | Raise `maxSize` or reject the file. |
| `BACKEND_NOT_CONFIGURED` | `login()` without `getChallenge`/`login`, or `signDocument()` without `timestamp`. | Configure `backend`. |
| `BACKEND_ERROR` | Backend returned non-2xx or `status !== 1`. | Inspect `httpStatus`, `params.detail`; see backend statuses below. |
| `EIMZO_ERROR` | Anything else from E-IMZO; status 0 with "Функция не найдена" = unknown function or outdated E-IMZO. | Read `reason`. |

## Other symptoms

- **Password asked on every signature.** Several `Eimzo` instances, or `loadKey()` before each `sign()`.
  Keep one instance and load the key once. Without "Remember for 6 hours" E-IMZO keeps the password 1 minute.
- **Fewer keys than in E-IMZO.** Keys without TIN and PINFL are skipped by design.
- **Works on localhost, fails on the real domain.** Missing API key for that domain, or the page is https and
  E-IMZO's `wss://127.0.0.1:64443` is not reachable.

## e-imzo-server `/backend/auth` statuses

| status | Meaning | Action |
|---|---|---|
| 1 | OK | Find the user by PINFL (`1.2.860.3.16.1.2`) or TIN (`1.2.860.3.16.1.1`, else `UID`). |
| -1 | Certificate status could not be checked (often VPN down) | HTTP 503, ask to retry later; do not log in. |
| -5 | Signing time outside the allowed window | Ask the user to fix the computer clock. |
| -10 | Invalid signature | 401 |
| -11, -12 | Certificate invalid (at signing time) | 401 |
| -20 | Challenge not found or expired (TTL 120 s) | Restart login. |
| -24, -25 | Certificate policy / CA not allowed | 401 |
