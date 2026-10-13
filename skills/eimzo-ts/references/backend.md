# Backend for eimzo-ts

The browser signs; the backend verifies through **e-imzo-server** (a Java service distributed to
integrators, needs a VPN key). Never call `/backend/*` methods of e-imzo-server from the browser.

## Endpoints expected by `createFetchBackend`

| App endpoint (any path) | Calls e-imzo-server | Returns to the browser |
|---|---|---|
| `GET /api/eimzo/challenge` | `GET /frontend/challenge` | its JSON as is: `{ "status": 1, "challenge": "...", "ttl": 120 }`. Send `Cache-Control: no-store`. |
| `POST /api/eimzo/login` (body: base64 PKCS#7, `text/plain`) | `POST /backend/auth` | your user/session JSON |
| `POST /api/eimzo/timestamp` (body: base64 PKCS#7) | `POST /frontend/timestamp/pkcs7` | its JSON as is: `{ "status": 1, "pkcs7b64": "..." }` |

On failure return HTTP 4xx/5xx or `{ "status": <not 1>, "message": "..." }`; `message` becomes the
`BACKEND_ERROR` text, so keep it user-safe.

## Required headers to e-imzo-server

- `X-Real-IP`: the user's IP, taken from your trusted reverse proxy, not from a client-supplied header.
- `Host`: your site's domain (configuration value, not copied from the request).

Java pitfall: `java.net.http.HttpClient` and `HttpURLConnection` refuse to set `Host`. Use Apache HttpClient 5,
or start the JVM with `-Djdk.httpclient.allowRestrictedHeaders=host` (HttpClient) /
`-Dsun.net.http.allowRestrictedHeaders=true` (HttpURLConnection).

## Login handler

1. Forward the PKCS#7 to `/backend/auth`.
2. `status == -1` → 503 (infrastructure problem, often VPN). Other `status != 1` → 401.
3. Read `subjectCertificateInfo.subjectName`: PINFL `1.2.860.3.16.1.2`, TIN `1.2.860.3.16.1.1` (or `UID`).
4. Find the user; if none, 403.
5. Rotate the session ID (or issue a token) and return the user.

## Document signing

1. Verify with `/backend/pkcs7/verify/attached` (or `/detached` with body `documentBase64|pkcs7`).
2. For every `pkcs7Info.signers[i]` require `verified`, `certificateVerified`,
   `certificateValidAtSigningTime` = true and no `revokedStatusInfo`.
3. Compare `pkcs7Info.documentBase64` with the document you expected to be signed.
4. Match the signer's PINFL/TIN with the session user.
5. Require a timestamp: `signingTime` is the user's PC clock.
6. Reject replays: include a unique ID in the document and store it once.
7. Store the PKCS#7 and the verification result as personal data (they contain PINFL).

Test keys verify only on a test e-imzo-server (test VPN), production keys only on production.
