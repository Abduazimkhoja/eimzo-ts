# Security policy

## Supported versions

Security fixes are released for the latest minor version on npm.

## Reporting a vulnerability

Please do **not** open a public issue. Report privately through GitHub:
**Security → Report a vulnerability** in this repository. Include the affected version, the browser, the
E-IMZO version, and steps to reproduce. Do not include real keys, passwords, or key owners' personal data.

You should get a reply within 7 days. After a fix is released, the advisory is published with credit, unless
you ask otherwise.

## Scope

`eimzo-ts` runs in the browser and talks to E-IMZO on the user's computer. In scope:

- the library sending data to an address other than E-IMZO or the configured backend;
- leaking a signature, `keyId`, or challenge to another origin;
- a way to sign data other than what the calling code passed;
- `unloadKey()` leaving a key loaded in E-IMZO without reporting an error.

Out of scope, because they are handled elsewhere:

- **Signature verification.** The library does not verify signatures; your backend must verify them with
  e-imzo-server (`/backend/auth`, `/backend/pkcs7/verify/*`). See [docs/backend.md](docs/backend.md).
- Vulnerabilities in E-IMZO itself or in e-imzo-server: report them to their developers.
- API keys in `DEV_API_KEYS`: they are public keys from the official E-IMZO example, bound to `localhost`
  and `127.0.0.1`.

## Guidance for applications

- Verify every signature on the server. A signature from the browser proves nothing until e-imzo-server checks it.
- Get a fresh challenge from e-imzo-server for every login, and pass the user's `X-Real-IP` and `Host`
  headers to e-imzo-server as described in [docs/backend.md](docs/backend.md).
- Call `await eimzo.unloadKey()` on logout, so the password remembered by E-IMZO does not stay on a shared computer.
- Do not show backend internals in error messages: `message` from your backend is shown to the user in
  `BACKEND_ERROR`.
