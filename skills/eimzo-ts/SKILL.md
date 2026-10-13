---
name: eimzo-ts
description: Integrates E-IMZO (Uzbekistan electronic digital signature, ЭЦП/ERI) into web apps with the eimzo-ts TypeScript library — listing the user's keys, creating PKCS#7 signatures, login by digital signature, timestamps, and error handling. Use when a browser app must sign data or log users in through the E-IMZO desktop application, when migrating from e-imzo.js / e-imzo-client.js, or when debugging E-IMZO errors such as NOT_INSTALLED, API_KEY_REJECTED or WRONG_PASSWORD.
license: MIT
metadata:
  package: eimzo-ts
  repository: https://github.com/abduazimkhuja/eimzo-ts
---

# eimzo-ts: E-IMZO in web apps

## What it solves

E-IMZO is a desktop application on the user's computer that holds digital signature keys and asks for the
password. A web page reaches it over WebSocket (`ws://127.0.0.1:64646` on http pages,
`wss://127.0.0.1:64443` on https). `eimzo-ts` wraps that protocol in a typed, Promise-based API with no
runtime dependencies.

## First, check that it fits

Use it when **all** are true:

- The code runs in a **browser** on a desktop computer where the user has E-IMZO installed.
- The task is to list keys, sign data/files, or log in with a digital signature.

Do **not** use it (and tell the user why) when:

- Signatures must be **verified** — that needs e-imzo-server on the backend; this library only creates them.
- Signing must happen on a phone (ID-CARD E-IMZO MOBILE) — not supported.
- The provider is not E-IMZO.
- The project already uses another working E-IMZO wrapper — do not replace it without being asked.

## Install and set up

```bash
npm install eimzo-ts
```

Create **one** shared instance (module singleton, Angular `providedIn: 'root'` service, React module export):

```ts
import { createEimzo, createFetchBackend, DEV_API_KEYS } from 'eimzo-ts';

export const eimzo = createEimzo({
  apiKeys: { ...DEV_API_KEYS }, // localhost/127.0.0.1; add { 'domain.uz': '<API key>' } for production
  locale: 'en',                  // 'ru' (default) | 'uz-Latn' | 'uz-Cyrl' | 'kaa' | 'en'
  backend: createFetchBackend({
    challengeUrl: '/api/eimzo/challenge',
    loginUrl: '/api/eimzo/login',
    timestampUrl: '/api/eimzo/timestamp',
  }),
});
```

Look at the project before choosing URLs: reuse its HTTP client conventions, CSRF header and auth cookies
(`createFetchBackend({ init: { credentials: 'include', headers: {...} } })`), or pass a custom
`backend: { getChallenge, login, timestamp }` object that uses the project's own HTTP client.

With SSR frameworks call E-IMZO only on the client (`useEffect`, `onMounted`, `afterNextRender`,
`'use client'` components).

## Choose the API

| Goal | Call | Needs backend |
|---|---|---|
| Show keys | `listKeys()` → `EimzoKey[]` (`CN`, `TIN`, `PINFL`, `O`, `T`, `validTo`, `expired`) | no |
| Hardware devices | `listDevices()` → `{ idcard, baikey, ckc }` | no |
| Login | `login(key)` | `getChallenge`, `login` |
| Sign text/bytes | `loadKey(key)` then `sign(data, { detached? })` | no |
| Sign a file | `loadKey(key)` then `signFile(file)` (detached, 10 MB limit by default) | no |
| Sign with timestamp | `loadKey(key)` then `signDocument(data)` | `timestamp` |
| Logout | `unloadKey()` | no |
| Anything else in E-IMZO | `call(plugin, name, args)` | no |

All signing methods return a base64 PKCS#7 string. Full reference: [references/api.md](references/api.md).
Ready-made snippets: [references/examples.md](references/examples.md).

## Handle errors

Every error is an `EimzoError` with a `code`. Branch on `code`, display `eimzo.t(error)`:

```ts
import { isEimzoError } from 'eimzo-ts';

try {
  await eimzo.login(key);
} catch (e) {
  if (isEimzoError(e, 'CANCELLED')) return;
  if (isEimzoError(e, 'NOT_INSTALLED')) return showInstallHint();
  showError(eimzo.t(e));
}
```

Diagnosis of each code and of the backend statuses: [references/troubleshooting.md](references/troubleshooting.md).

## Backend

The browser never calls e-imzo-server directly. If the project has no backend endpoints yet, implement
them as described in [references/backend.md](references/backend.md) — signature verification **must** be
done on the server.

## Verify the integration

1. `npm run build` / the project's typecheck passes; imports come from `'eimzo-ts'` only.
2. Only one `createEimzo()` call exists in the app.
3. Code that runs during SSR does not call E-IMZO.
4. `CANCELLED` is not shown as an error; `NOT_INSTALLED` shows how to install or start E-IMZO.
5. Logout calls `unloadKey()`.
6. Backend: `/frontend/challenge` is not cached; `/backend/auth` and `/backend/pkcs7/verify/*` are called from
   the server with `X-Real-IP` and `Host`; the signer's PINFL/TIN is matched to the user.
7. Manual test on a computer with E-IMZO: list keys → login → cancel the password window → wrong password →
   correct password. Without E-IMZO, the hosted demo at https://abduazimkhuja.github.io/eimzo-ts/demo/
   shows the flow with mock keys.

For unit tests, pass `transport: async (request) => response` to `createEimzo` instead of mocking WebSocket.
