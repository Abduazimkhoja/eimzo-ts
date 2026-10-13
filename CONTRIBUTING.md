# Contributing to eimzo-ts

Thanks for helping. This file covers how to set up the project, what a good change looks like, and how
releases work. Issues and pull requests can be written in English, Russian, or Uzbek.

## Setup

Node.js 22 or newer and npm.

```bash
npm install
npm run check   # what CI runs: lint, typecheck, tests with coverage thresholds, build, publint, attw
```

You do not need E-IMZO for development: all tests use a fake transport. To try a change against a real
E-IMZO on Windows, run `npm run check:eimzo` (read-only) or `npm run check:eimzo -- --interactive N`
(opens password windows and signs with key `N`). The script masks owners' personal data in its output.

| Command | What it does |
|---|---|
| `npm test` | Unit and integration tests (vitest) |
| `npm run test:coverage` | Tests with coverage thresholds from `vitest.config.ts` |
| `npm run typecheck` | `tsc --noEmit`, including public API type tests in `test/types.test.ts` |
| `npm run lint` | ESLint with type-aware rules |
| `npm run build` | `dist/`: ESM, CJS, IIFE (`EimzoClient`), `.d.ts` |
| `npm run check:package` | `publint` and `@arethetypeswrong/cli` against the packed tarball |
| `npm run demo` | Demo at `http://localhost:3000/demo/` (works without E-IMZO) |

## Project layout

| Path | Contents |
|---|---|
| `src/eimzo.ts` | The `Eimzo` client: keys, signing, login, queue, key lifecycle |
| `src/transport.ts` | WebSocket and `EIMZOEXT` transports |
| `src/backend.ts` | `createFetchBackend` |
| `src/errors.ts` | Error codes and mapping of E-IMZO responses |
| `src/abort.ts` | `AbortSignal` helpers |
| `src/i18n.ts`, `src/locales/` | Error messages |
| `src/certificate.ts` | Parsing of certificate aliases |
| `test/` | Tests; `test/helpers.ts` has the fake transport |

## Rules for changes

- **No runtime dependencies.** Dev dependencies are fine when they pay for themselves.
- **Public API is a contract.** Do not rename or remove exports, options, or error codes without discussing it
  in an issue first. New options must be optional. New parameters of callbacks that users implement
  (`Transport`, `EimzoBackend`) must be optional, so existing implementations keep compiling.
- **Every public method** goes through `guard` (localized messages). Methods that can open a password window
  go through `exclusive` (one at a time). Methods that wait on E-IMZO or a backend accept `{ signal }`.
- **E-IMZO response mappings** in `src/errors.ts` must come from real E-IMZO responses. Add a test with the exact
  response (`status` and `reason`) and the E-IMZO version you saw it on.
- **New error code:** add it to `EimzoErrorParams`, to every locale in `src/locales/`, to the error tables in
  both READMEs, and mention it in the changelog. Adding a code is a minor change.
- **Personal data:** never put real key owners' names, PINFL, or TIN into tests, logs, issues, or commits.
- **Style:** code comments and locale texts are in Russian; keep the existing style. ESLint must pass.
- **Tests:** a bug fix starts with a failing test that reproduces it. Keep coverage above the thresholds.

## Pull requests

1. Fork, create a branch, make the change with tests.
2. Run `npm run check`.
3. Add a line under `## [Unreleased]` in `CHANGELOG.md` (`Добавлено`, `Изменено`, `Исправлено`).
4. Describe what changed and why. For behaviour that depends on E-IMZO, say which version you tested with.

## Versioning

The project follows [Semantic Versioning](https://semver.org/). Before 1.0.0:

- **patch** (`0.1.x`): bug fixes, documentation, internal changes;
- **minor** (`0.x.0`): new features, and breaking changes when they cannot be avoided. Each breaking change is
  listed in the changelog under `Изменено` with migration steps.

After 1.0.0, breaking changes go only into major versions.

## Releases (maintainers)

1. Move `## [Unreleased]` entries in `CHANGELOG.md` to a new version section and update the links at the bottom.
2. `npm version patch` (or `minor`), then `git push --follow-tags`.
3. The `release.yml` workflow checks that the tag matches `package.json`, runs `npm run check`
   (via `prepublishOnly`), publishes to npm with provenance (Trusted Publishing), and creates a GitHub release.
