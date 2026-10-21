# eimzo-ts API reference

```ts
import {
  createEimzo, Eimzo, createFetchBackend, DEV_API_KEYS, DEFAULT_MAX_FILE_SIZE,
  EimzoError, isEimzoError, formatEimzoError,
  parseX500, parseCertificateInfo,
  createWebSocketTransport, createCapiwsTransport, createDefaultTransport, defaultEimzoUrl,
  ru, uzLatn, uzCyrl, kaa, en, builtinMessages, DEFAULT_LOCALE,
} from 'eimzo-ts';
import type { EimzoKey, PfxKey, TokenKey, EimzoOptions, EimzoBackend, EimzoErrorCode, Transport } from 'eimzo-ts';
```

Without a bundler: `<script src="https://unpkg.com/eimzo-ts@0.3/dist/index.global.js">` → global `EimzoClient`.

## createEimzo(options?): Eimzo

| Option | Type | Default | Notes |
|---|---|---|---|
| `apiKeys` | `Record<string, string> \| string[]` | — | Domain → API key. `DEV_API_KEYS` covers `localhost`, `127.0.0.1`. Omitted → `apikey` is not called. |
| `backend` | `EimzoBackend<TLogin>` | — | `{ getChallenge?(opts?): Promise<string>; login?(pkcs7, opts?): Promise<TLogin>; timestamp?(pkcs7, opts?): Promise<string> }`; `opts = { signal? }` |
| `minVersion` | `string` | `'4.86'` | `'major.minor'` |
| `locale` | `string` | `'ru'` | `'ru' \| 'uz-Latn' \| 'uz-Cyrl' \| 'kaa' \| 'en'` or custom with `messages` |
| `messages` | `Record<locale, Partial<Record<key, string>>>` | — | Strings with `{param}` placeholders; JSON catalogs: `eimzo-ts/locales/<locale>.json`. Missing texts fall back to `messages.ru`, then built-in Russian. |
| `autoReloadKey` | `boolean` | `true` | On `KEY_NOT_FOUND`, reload the same key and retry `sign` once. Not applied when `keyId` is passed explicitly. |
| `timeoutMs` | `number` | none | Every call. Signing waits for the user, so keep it unset or large; prefer `signal: AbortSignal.timeout(ms)` per operation. |
| `url` | `string` | `defaultEimzoUrl()` | `wss://127.0.0.1:64443/service/cryptapi` on https, `ws://127.0.0.1:64646/service/cryptapi` otherwise |
| `WebSocketImpl` | `typeof WebSocket` | global | For non-browser environments. |
| `transport` | `(req: { plugin?, name, arguments? }, opts?: { signal? }) => Promise<{ success: boolean, reason?, ... }>` | WebSocket or `EIMZOEXT` | Use for tests. |

## Methods

All return Promises and reject with `EimzoError`. Every method except `unloadKey` also takes
`{ signal?: AbortSignal }` (in its options object, or as the last argument); an aborted call rejects with
`signal.reason` (an `AbortError` by default), not `EimzoError`. A queued call that is aborted never starts;
an open E-IMZO password window is not closed.

- `init(): Promise<{ major, minor }>` — version check + API keys. Cached; retried after a failure. Called by every method.
- `getVersion(): Promise<{ major, minor }>`
- `listKeys(): Promise<EimzoKey[]>` — PFX keys (plus `ftjc` tokens on E-IMZO older than 4.12). Keys without TIN and PINFL are skipped.
  `EimzoKey` fields: `type: 'pfx' | 'ftjc'`, `CN`, `TIN` (INN, or UID when no INN), `PINFL`, `UID`, `O`, `T`,
  `serialNumber`, `validFrom: Date | null`, `validTo: Date | null`, `expired: boolean`;
  PFX also has `disk`, `path`, `name`, `alias`.
- `listDevices(): Promise<{ idcard: boolean, baikey: boolean, ckc: boolean }>`
- `loadKey(key: EimzoKey | 'idcard' | 'baikey' | 'ckc', { verifyPassword? }): Promise<string>` — returns and stores `keyId`; unloads the previously loaded PFX key. `verifyPassword` asks for the password immediately (no "remember for 6 hours" checkbox in that window).
- `sign(data: string | Uint8Array | ArrayBuffer, { detached?, base64?, keyId? }): Promise<string>` — strings are UTF-8 encoded unless `base64: true`. Attached by default.
- `signFile(file: Blob, { detached = true, maxSize = 10 MB, keyId? }): Promise<string>` — `FILE_TOO_LARGE` before reading the file.
- `login(key): Promise<TLogin>` — `backend.getChallenge()` → `loadKey(key)` → `sign(challenge)` → `backend.login(pkcs7)`.
- `signDocument(data, signOptions): Promise<string>` — `sign` → `backend.timestamp(pkcs7)`. Needs a loaded key.
- `unloadKey(): Promise<void>` — `pfx.unload_key`; already-unloaded is not an error. Call on logout.
- `call<R>(plugin, name, args?): Promise<EimzoResponse & R>` — raw E-IMZO call; `success: false` → `EimzoError`.
  Response fields are `unknown`: type the ones you read via `R` and validate the values.
- `keyId: string | null`, `locale`, `setLocale(locale)`, `t(error, locale?)`.

`loadKey`, `unloadKey`, `sign`, `signFile`, `login`, `signDocument` run one at a time (queued).

## createFetchBackend(options)

| Option | Method | Request | Expected response |
|---|---|---|---|
| `challengeUrl` | `getChallenge` | `GET`, `cache: 'no-store'` | `{ "status": 1, "challenge": "..." }` |
| `loginUrl` | `login` | `POST`, body = PKCS#7, `Content-Type: text/plain` | any JSON, returned as is (its `status` is not checked); `204` → `null`; non-JSON `200` → `BACKEND_ERROR` |
| `timestampUrl` | `timestamp` | `POST`, body = PKCS#7, `text/plain` | `{ "status": 1, "pkcs7b64": "..." }` |
| `init` | all | merged into every `fetch` (headers, `credentials`) | |
| `fetch` | all | custom fetch implementation | |

Non-2xx, a network failure, or (challenge and timestamp only) a present `status !== 1` or an empty
`challenge` / `pkcs7b64` → `BACKEND_ERROR`
(`httpStatus`, `params.detail` from `message`, original error in `cause`).

## EimzoError

`code`, `params`, `message` (localized), `reason` (raw E-IMZO text), `status` (E-IMZO numeric status),
`wsCode` (WebSocket close code), `httpStatus` (backend). Codes: `NOT_INSTALLED`, `WEBSOCKET_UNSUPPORTED`,
`TIMEOUT`, `OUTDATED_VERSION {installed, min}`, `API_KEY_REJECTED`, `WRONG_PASSWORD`, `CANCELLED`,
`KEY_NOT_FOUND`, `FILE_TOO_LARGE {size, max}`, `KEY_NOT_LOADED`, `BACKEND_NOT_CONFIGURED {methods}`,
`BACKEND_ERROR {status?, detail?}`, `EIMZO_ERROR {reason?}`.

E-IMZO 6.3.5 responses mapped: status `-5000` → `CANCELLED`; `-1010`, `-1014` → `KEY_NOT_FOUND`;
reason containing `BadPaddingException`, `Sequence tag error`, `getSecretKey failed` → `WRONG_PASSWORD`.
