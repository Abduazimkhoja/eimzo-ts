# AGENTS.md

Guidance for AI coding agents working **in this repository** or **integrating `eimzo-ts` into an app**.

## What this library is

`eimzo-ts` is a browser-side TypeScript client for E-IMZO, the desktop application used in Uzbekistan for
electronic digital signatures. It lists the user's keys, creates PKCS#7 signatures, and runs the
challenge-based login flow. It talks to E-IMZO over WebSocket (`ws://127.0.0.1:64646`,
`wss://127.0.0.1:64443`). It does **not** verify signatures — that is done by e-imzo-server on the backend.

Use it when a web app must sign data or log users in with E-IMZO on a desktop computer. Do not use it for
server-side verification, mobile signing (ID-CARD E-IMZO MOBILE), or other signature providers.

## Using the library in an app

```bash
npm install eimzo-ts
```

```ts
import { createEimzo, createFetchBackend, DEV_API_KEYS, isEimzoError } from 'eimzo-ts';

export const eimzo = createEimzo({
  apiKeys: DEV_API_KEYS, // add { 'your-domain.uz': '<API key>' } for production
  backend: createFetchBackend({ challengeUrl: '/api/eimzo/challenge', loginUrl: '/api/eimzo/login' }),
});
```

Rules that prevent common bugs:

- Create **one** `Eimzo` instance per app (module singleton or a root-level service). A new instance or a new
  `loadKey()` per signature makes E-IMZO ask for the password every time.
- Call it **only in the browser**. With SSR (Next.js, Nuxt, Angular SSR) call it from client-only code; a call on the
  server rejects with `NOT_IN_BROWSER` (a Node script must pass `WebSocketImpl`).
- Branch on `error.code` (or `isEimzoError(e, 'CODE')`), never on `error.message`. Show `eimzo.t(error)`.
- Treat `CANCELLED` as "the user changed their mind", not as an error to display.
- `KEY_NOT_LOADED` and `BACKEND_NOT_CONFIGURED` mean the calling code is wrong: `sign()` before `loadKey()`,
  or a missing `backend` method.
- Filter out `key.expired` keys or show them disabled.
- Call `await eimzo.unloadKey()` on logout.
- `login()` needs `backend.getChallenge` and `backend.login`; `signDocument()` needs `backend.timestamp`.
  `sign()`, `signFile()`, `listKeys()` need no backend.
- The backend must verify signatures through e-imzo-server (`/backend/auth`,
  `/backend/pkcs7/verify/attached|detached`) with the `X-Real-IP` and `Host` headers. See `docs/backend.md`.
- Never put API keys for production domains into a public repository unless the project already does so;
  they are domain-bound but still configuration.

Detailed API and examples: `README.md`, `skills/eimzo-ts/` (Agent Skill), `docs/backend.md`, `docs/migration.md`.

## Working in this repository

- Package manager: **npm** (`package-lock.json`). Node 22+ for development (CI runs 22 and 24).
- Commands:
  - `npm run check` — everything CI runs: lint, typecheck, tests with coverage thresholds, build, `publint`, `attw`
  - `npm test` — vitest, all tests use a fake transport (no E-IMZO needed)
  - `npm run typecheck` — `tsc --noEmit`, also checks public API types in `test/types.test.ts`
  - `npm run lint` — ESLint with type-aware rules (`no-floating-promises` etc.)
  - `npm run build` — tsup → `dist/` (ESM, CJS, IIFE global `EimzoClient`, `.d.ts`)
  - `npm run demo` — build and serve `http://localhost:3000/demo/`
  - `npm run check:eimzo` — runs against a real local E-IMZO; `-- --interactive N` opens password windows
- Layout: `src/eimzo.ts` (client class), `src/transport.ts` (WebSocket / EIMZOEXT), `src/errors.ts`
  (error codes and mapping of E-IMZO responses), `src/i18n.ts` + `src/locales/` (messages),
  `src/certificate.ts` (X.500 alias parsing), `src/backend.ts` (`createFetchBackend`).
- Code comments and locale texts are in Russian; keep that style. No runtime dependencies — do not add any.
- Every public method goes through `guard` (localized messages); methods that can open a password window go
  through `exclusive` (one at a time). Methods that wait on E-IMZO or the backend accept `{ signal }`
  (`EimzoCallOptions`) and pass it down to `invoke`/`transport`/`backend`. Keep new methods consistent with that.
- Read fields of E-IMZO responses through `invoke<{ field?: unknown }>(...)` and validate them. The index
  signature of `EimzoResponse` is `unknown`; the public `call<R>()` lets callers type the fields they read.
- E-IMZO response mappings in `src/errors.ts` are based on real responses from E-IMZO 6.3.5. Add a test with
  the exact real response when you add a mapping.
- Do not print key owners' personal data (names, PINFL, TIN) from real E-IMZO in logs or commits; the check
  script masks them.
- Releases: update `CHANGELOG.md`, then `npm version patch|minor` and `git push --follow-tags`. The
  `release.yml` workflow publishes to npm via Trusted Publishing.
