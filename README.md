# eimzo-ts — TypeScript client for E-IMZO

[![npm](https://img.shields.io/npm/v/eimzo-ts)](https://www.npmjs.com/package/eimzo-ts)
[![CI](https://github.com/abduazimkhuja/eimzo-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/abduazimkhuja/eimzo-ts/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/eimzo-ts)](LICENSE)

**English** · [Русский](README.ru.md)

`eimzo-ts` lets a web page talk to [E-IMZO](https://e-imzo.uz), the desktop application used in
Uzbekistan for electronic digital signatures (ЭЦП / ERI). With it you can list the user's signing keys,
create PKCS#7 (CMS) signatures, and log users in with their digital signature.

It replaces `e-imzo.js` and `e-imzo-client.js` from the official E-IMZO example with a typed,
Promise-based API: no global variables, no changes to `String.prototype` or `Date.prototype`,
zero runtime dependencies.

> **Unofficial.** This project is not affiliated with the developers of E-IMZO.

[Documentation](https://abduazimkhuja.github.io/eimzo-ts/) ·
[Live demo](https://abduazimkhuja.github.io/eimzo-ts/demo/) (works without E-IMZO, using mock keys) ·
[npm](https://www.npmjs.com/package/eimzo-ts) ·
[Changelog](CHANGELOG.md)

## Use cases

- **Login with a digital signature.** Get a one-time challenge from your backend, sign it with the user's key,
  and send the signature to your backend for verification.
- **Sign a document or form** (attached or detached PKCS#7), optionally with a trusted timestamp.
- **Sign a file** picked with `<input type="file">`.
- **Show the user's keys:** owner name, TIN (INN), PINFL, organization, validity, and an `expired` flag.
- **Migrate from `e-imzo.js` / `e-imzo-client.js`** callbacks to `async`/`await` ([migration guide](docs/migration.md), in Russian).

## How it works

```
your page (eimzo-ts) ──WebSocket──► E-IMZO on the user's PC   (asks for the key password)
        │
        └── fetch ──► your backend ──► e-imzo-server            (verifies the signature)
```

The library runs in the **browser**. It connects to E-IMZO at `ws://127.0.0.1:64646` (pages served over
http) or `wss://127.0.0.1:64443` (https). If the `EIMZOEXT` browser extension object is present on the
page, it is used instead. The password is typed into E-IMZO's own window; your page never sees it.

Signatures are **verified on the server** by e-imzo-server, not by this library.

## Installation

```bash
npm install eimzo-ts
```

Without a bundler, use the IIFE build. It exposes a global `EimzoClient`:

```html
<script src="https://unpkg.com/eimzo-ts@0.2/dist/index.global.js"></script>
<script>
  const eimzo = EimzoClient.createEimzo({ apiKeys: EimzoClient.DEV_API_KEYS });
</script>
```

The package ships ESM, CommonJS, and IIFE builds with TypeScript declarations. It is side-effect free.

## Quick start

```ts
import { createEimzo, createFetchBackend, DEV_API_KEYS } from 'eimzo-ts';

const eimzo = createEimzo({
  apiKeys: { ...DEV_API_KEYS, 'my-site.uz': 'API key for my-site.uz' },
  backend: createFetchBackend({
    challengeUrl: '/api/eimzo/challenge',
    loginUrl: '/api/eimzo/login',
    timestampUrl: '/api/eimzo/timestamp',
    init: { credentials: 'include' }, // headers, CSRF token, etc.
  }),
});

const keys = await eimzo.listKeys();                 // the user's keys
const user = await eimzo.login(keys[0]);             // E-IMZO asks for the password
const pkcs7 = await eimzo.signDocument('document');  // signature + timestamp
```

Create **one** instance per application. It keeps the `keyId` of the loaded key, and E-IMZO remembers
the password per `keyId`.

### Sign without a backend

```ts
const keys = await eimzo.listKeys();
await eimzo.loadKey(keys.find((k) => !k.expired)!);
const pkcs7 = await eimzo.sign('text to sign');             // attached PKCS#7, base64
const detached = await eimzo.sign(bytes, { detached: true }); // Uint8Array or ArrayBuffer
const filePkcs7 = await eimzo.signFile(input.files[0]);      // detached by default, max 10 MB
```

### Handle errors

```ts
import { isEimzoError } from 'eimzo-ts';

try {
  await eimzo.login(key);
} catch (e) {
  if (isEimzoError(e, 'CANCELLED')) return;             // the user closed the password window
  if (isEimzoError(e, 'NOT_INSTALLED')) showInstallHint();
  else showError(eimzo.t(e));                           // localized message
}
```

### Custom messages and i18next / Transloco

Texts are plain strings with `{param}` placeholders, so a language is just a JSON object. Replace single
texts or add a whole language with `messages`:

```ts
import tg from './eimzo-tg.json';                 // your own language, same keys as ru.json

const eimzo = createEimzo({
  locale: 'tg',
  messages: { tg, en: { WRONG_PASSWORD: 'Check the password.' } },
});
```

Missing texts fall back to `messages.ru`, then to built-in Russian. The built-in catalogs are published as JSON
(`eimzo-ts/locales/ru.json`, `en`, `uz-Latn`, `uz-Cyrl`, `kaa`): copy one as a template, or feed it to
i18next / Transloco as a resource. Or skip the dictionary and map `error.code` yourself — the code is stable,
the text is not:

```ts
import ru from 'eimzo-ts/locales/ru.json';

i18next.addResourceBundle('ru', 'eimzo', ru);     // "OUTDATED_VERSION": "... ({installed}) ... {min} ..."
catch (e) {
  if (isEimzoError(e)) showError(i18next.t(`eimzo:${e.code}`, e.params)); // i18next uses {{x}}, see note below
}
```

Placeholders are `{name}`; i18next expects `{{name}}` by default, so set
`interpolation: { prefix: '{', suffix: '}' }` for that namespace. `BACKEND_ERROR` and `EIMZO_ERROR` have extra keys
(`*_DETAIL`, `*_STATUS`, `*_REASON`) for the variants with parameters; pick them from `error.params`. The `reason`
text that E-IMZO itself returns is not translated.

### Low-level calls

`call(plugin, name, args)` runs any E-IMZO function. Response fields are `unknown`; pass a type for the
fields you read and validate the values yourself:

```ts
const res = await eimzo.call<{ certificates?: unknown }>('pfx', 'list_all_certificates');
const list = Array.isArray(res.certificates) ? res.certificates : [];
```

### Cancel an operation

Every method that waits for E-IMZO or your backend accepts an `AbortSignal`, like `fetch`. Use it when a
component unmounts, the user navigates away, or you need a per-operation time limit:

```ts
const controller = new AbortController();
const keys = await eimzo.listKeys({ signal: controller.signal });
await eimzo.sign(data, { signal: AbortSignal.timeout(60_000) });
controller.abort(); // the pending call rejects with signal.reason (an AbortError by default)
```

An aborted call rejects with `signal.reason`, not with `EimzoError`, so check `e.name === 'AbortError'`
(or your own reason). A call that is still waiting in the signing queue, or for `init()`, never reaches E-IMZO. A password window that
E-IMZO has already opened stays open: E-IMZO has no way to close it, and the next queued operation waits
for it to finish. Requests already sent are never interrupted: if `loadKey()` is aborted after it has
unloaded the previous key, that key stays unloaded.

## Features

- Typed API for keys, signing, login, and timestamps; Promise-based.
- PFX keys, ID card, BAIK token, and CKC devices (`listDevices`, `loadKey('idcard' | 'baikey' | 'ckc')`).
- Typed `EimzoError` with a stable `code`. E-IMZO's raw `reason` and `status` are kept.
- Error messages in Russian, Uzbek (Latin and Cyrillic), Karakalpak, and English; you can override any text.
- Concurrent `sign()` calls are queued, so a double click does not open two password windows.
- Cancellation with `AbortSignal` (`{ signal }`) for every method that waits for E-IMZO or the backend.
- If E-IMZO has forgotten the `keyId` (24 hours passed, or E-IMZO restarted), the key is loaded again and
  the signature is retried (`autoReloadKey`).
- `unloadKey()` on logout removes the key and its remembered password from E-IMZO.
- `createFetchBackend()` matches e-imzo-server's response format, so your backend can proxy it as-is.
- Zero runtime dependencies; ESM, CJS, and IIFE builds; `.d.ts` included.

Behaviour for cancel, wrong password, signing, and unloading was checked against E-IMZO 6.3.5.

## API

| Method | Description |
|---|---|
| `createEimzo(options)` | Creates a client. See options below. |
| `init()` | Checks the E-IMZO version and installs API keys. Called automatically. |
| `getVersion()` | Installed E-IMZO version, `{ major, minor }`. |
| `listKeys()` | User keys as `EimzoKey[]`: `CN`, `TIN`, `PINFL`, `O`, `T`, `validFrom`, `validTo`, `expired`. Keys without TIN and PINFL are skipped. |
| `listDevices()` | `{ idcard, baikey, ckc }` — which hardware devices are connected. |
| `loadKey(key, { verifyPassword })` | Loads a key (or `'idcard' \| 'baikey' \| 'ckc'`) and stores its `keyId`. Unloads the previous key. |
| `sign(data, { detached, base64, keyId })` | Returns a base64 PKCS#7. `data`: `string`, `Uint8Array`, or `ArrayBuffer`. |
| `signFile(blob, { detached, maxSize, keyId })` | Signs a `File` or `Blob`. Detached by default, 10 MB limit. |
| `login(key)` | Challenge → `loadKey` → sign → `backend.login`. Returns what `backend.login` returns. |
| `signDocument(data, options)` | `sign` → `backend.timestamp`. |
| `unloadKey()` | Unloads the key from E-IMZO. Call it on logout. |
| `call(plugin, name, args)` | Calls any E-IMZO function (see `http://127.0.0.1:64646/apidoc.html`). |
| `keyId`, `locale`, `setLocale(locale)`, `t(error)` | Current key and language of error messages. |

`init`, `getVersion`, `listKeys`, `listDevices`, `loadKey`, `sign`, `signFile`, `login`, `signDocument`, and
`call` also accept `{ signal }` (see [Cancel an operation](#cancel-an-operation)). `unloadKey` does not:
cleanup on logout should always finish.

Other exports: `createFetchBackend`, `EimzoError`, `isEimzoError`, `formatEimzoError`, `parseX500`,
`parseCertificateInfo`, `createWebSocketTransport`, `createCapiwsTransport`, `createDefaultTransport`,
`defaultEimzoUrl`, `DEV_API_KEYS`, `DEFAULT_MAX_FILE_SIZE`, the locale objects (`ru`, `uzLatn`, `uzCyrl`,
`kaa`, `en`), and all types.

### Options

| Option | Default | Description |
|---|---|---|
| `apiKeys` | — | `{ domain: key }` or `[domain, key, ...]`. Use `DEV_API_KEYS` for `localhost` and `127.0.0.1`. If omitted, `apikey` is not called. |
| `backend` | — | `createFetchBackend(...)` or your own `{ getChallenge, login, timestamp }`. |
| `minVersion` | `'4.86'` | Older E-IMZO → `OUTDATED_VERSION`. |
| `locale` | `'ru'` | `'ru'`, `'uz-Latn'`, `'uz-Cyrl'`, `'kaa'`, `'en'`, or your own code with `messages`. |
| `messages` | — | Override texts: `{ en: { WRONG_PASSWORD: '...' } }`; a new language is a full object (see `eimzo-ts/locales/ru.json`). Missing texts fall back to `messages.ru`, then to built-in Russian. |
| `autoReloadKey` | `true` | Reload the key and retry when E-IMZO no longer knows the `keyId`. |
| `timeoutMs` | none | Timeout of every E-IMZO call. Off by default because signing waits for the user. For a limit on one operation, pass `signal: AbortSignal.timeout(ms)`. |
| `url`, `WebSocketImpl`, `transport` | — | For tests and non-standard environments. |

### Error codes

| `code` | Meaning |
|---|---|
| `NOT_INSTALLED` | E-IMZO is not installed or not running. |
| `OUTDATED_VERSION` | E-IMZO is older than `minVersion` (`params.installed`, `params.min`). |
| `API_KEY_REJECTED` | E-IMZO rejected the API key for this domain. |
| `WRONG_PASSWORD` | Wrong key password. |
| `CANCELLED` | The user closed the password window. Usually not worth showing. |
| `KEY_NOT_FOUND` | E-IMZO does not know this `keyId`. |
| `KEY_NOT_LOADED` | `sign()` was called before `loadKey()` — a bug in the calling code. |
| `FILE_TOO_LARGE` | File is larger than `maxSize` (`params.size`, `params.max`). |
| `BACKEND_NOT_CONFIGURED` | A required `backend` method is missing — a bug in the calling code. |
| `BACKEND_ERROR` | Your backend returned an error (`httpStatus`, `params.detail`). |
| `EIMZO_ERROR` | Any other E-IMZO error; see `reason` and `status`. |
| `TIMEOUT`, `WEBSOCKET_UNSUPPORTED` | Rare. |

## Backend contract

The browser never calls e-imzo-server directly. `createFetchBackend` expects e-imzo-server's response
format, so your backend can proxy these calls:

| Client request | Your backend calls | Response |
|---|---|---|
| `GET challengeUrl` | `GET /frontend/challenge` (do not cache) | `{ "status": 1, "challenge": "..." }` |
| `POST loginUrl`, body: PKCS#7 (`text/plain`) | `POST /backend/auth`, then finds the user by PINFL/TIN and opens a session | any JSON, returned from `login()` as is; `204 No Content` → `null` |
| `POST timestampUrl`, body: PKCS#7 (`text/plain`) | `POST /frontend/timestamp/pkcs7` | `{ "status": 1, "pkcs7b64": "..." }` |

In the challenge and timestamp responses (e-imzo-server's format), `status`, when present, must be `1`, and
`challenge` / `pkcs7b64` must be non-empty strings. The login response belongs to your app and is not inspected. An HTTP error, a non-JSON `200` response (for example, an SPA
fallback page), or a network failure rejects with `BACKEND_ERROR`; the original error is in `cause`.

A full guide with a Spring Boot example, status codes, and security checklist (in Russian):
[docs/backend.md](docs/backend.md).

## Compatibility

- **Browsers:** any modern browser with WebSocket. The build targets ES2020.
- **TypeScript:** declarations included for ESM and CJS.
- **Frameworks:** framework-agnostic: plain functions and a class, no framework dependency. It can be used
  from Angular, React, Vue, Svelte, or a plain page. With SSR frameworks (Next.js, Nuxt, Angular SSR), call
  it only on the client: E-IMZO runs on the user's computer, not on your server.
- **Node.js:** not the intended environment. It can talk to a local E-IMZO from a script if you pass a
  `WebSocketImpl` that sends an `Origin` header (see `scripts/check-real-eimzo.mjs`).
- **E-IMZO:** 4.86 or newer by default (`minVersion`). Tested with E-IMZO 6.3.5.

## When not to use it

- **To verify signatures.** Verification needs e-imzo-server on your backend; this is a client library.
- **For mobile signing** (ID-CARD E-IMZO MOBILE, QR code / deep link). Not supported yet.
- **If you need a ready-made UI** (key picker modal). `eimzo-ts` has no UI components.
- **If you need another provider** (for example RS-IMZO).

## Alternatives

- The official `e-imzo.js` + `e-imzo-client.js` example: callback-based, uses globals.
- Other npm packages for E-IMZO exist. Some are framework-specific (Vue or React wrappers, UI modals),
  some are framework-agnostic clients, and some are server-side clients for e-imzo-server. Search npm for
  [`e-imzo`](https://www.npmjs.com/search?q=e-imzo) and compare their APIs and maintenance with your needs.
  This project has not audited or benchmarked them.

## FAQ

**Does it work over HTTPS?** Yes. On https pages it connects to `wss://127.0.0.1:64443`.

**Do I need an API key?** For `localhost` and `127.0.0.1`, use `DEV_API_KEYS` (public keys from the official
example). For another domain during development, enable "Developer mode" in the E-IMZO tray menu. For
production, request an API key for each domain and subdomain.

**Is the password sent to my site?** No. E-IMZO asks for it in its own window. Without "Remember for 6 hours"
it is remembered for 1 minute per `keyId`.

**How do I test my code without E-IMZO?** Pass your own `transport` — a function
`(request) => Promise<response>`:

```ts
const eimzo = createEimzo({
  transport: async (req) => {
    if (req.name === 'version') return { success: true, major: '6', minor: '3' };
    if (req.plugin === 'pfx' && req.name === 'list_all_certificates') return { success: true, certificates: [] };
    return { success: false, reason: `not mocked: ${req.plugin}.${req.name}` };
  },
});
```

The demo's mock ([`demo/mock-eimzo.js`](demo/mock-eimzo.js)) is a fuller example.

**Can I read what is inside a PKCS#7?** The demo has a viewer ([`demo/pkcs7-viewer.js`](demo/pkcs7-viewer.js))
that shows the document, signer, and signing time. It does not verify the signature.

**Is `signingTime` trustworthy?** No. It comes from the user's computer clock. Use a timestamp
(`signDocument`) and verify it on the server.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `NOT_INSTALLED` | E-IMZO is not running. Start it (tray icon) or install it from [e-imzo.uz](https://e-imzo.uz/main/downloads/). |
| `API_KEY_REJECTED`, or E-IMZO functions fail on a new domain | No API key for this domain. Use Developer mode for testing; add the production key to `apiKeys`. |
| `OUTDATED_VERSION` | Update E-IMZO, or lower `minVersion` if you know your users' versions. |
| `WRONG_PASSWORD` with `reason` "Password is not ASCII" | The password was typed in another keyboard layout. |
| `listKeys()` returns fewer keys than E-IMZO shows | Keys without TIN and PINFL are skipped, as in the official client. |
| Password is asked on every signature | A new `Eimzo` instance or `loadKey()` per signature creates a new `keyId`. Keep one instance. |
| `KEY_NOT_FOUND` with `autoReloadKey: false` | E-IMZO restarted or 24 hours passed. Call `loadKey()` again. |
| `BACKEND_ERROR` | Check `httpStatus` and `params.detail`; for `/backend/auth` status codes see [docs/backend.md](docs/backend.md). |

## For AI coding assistants

- [`llms.txt`](https://abduazimkhuja.github.io/eimzo-ts/llms.txt) and
  [`llms-full.txt`](https://abduazimkhuja.github.io/eimzo-ts/llms-full.txt) — documentation index and full text.
- [Agent Skill](skills/eimzo-ts/SKILL.md) for tools that support the Agent Skills format.
- See [AI_INTEGRATION.md](AI_INTEGRATION.md).

## Development

```bash
npm install
npm run check          # everything CI runs: lint, types, tests + coverage, build, package checks
npm test               # vitest
npm run lint           # ESLint with type-aware rules
npm run typecheck      # tsc, including public API type tests
npm run build          # dist/: ESM, CJS, IIFE + .d.ts
npm run demo           # http://localhost:3000/demo/
npm run check:eimzo    # checks against a locally installed E-IMZO; --interactive N signs with key N
```

## Contributing

Bug reports and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues
privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
