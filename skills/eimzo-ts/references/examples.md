# eimzo-ts examples

All snippets assume one shared instance:

```ts
// eimzo.ts
import { createEimzo, createFetchBackend, DEV_API_KEYS } from 'eimzo-ts';

export const eimzo = createEimzo({
  apiKeys: { ...DEV_API_KEYS },
  backend: createFetchBackend({
    challengeUrl: '/api/eimzo/challenge',
    loginUrl: '/api/eimzo/login',
    timestampUrl: '/api/eimzo/timestamp',
  }),
});
```

## Key picker data

```ts
const keys = await eimzo.listKeys();
const options = keys.map((k, i) => ({
  value: i,
  label: `${k.CN} — ${k.TIN || k.PINFL}${k.O ? `, ${k.O}` : ''}`,
  disabled: k.expired,
}));
```

## Login

```ts
import { isEimzoError, type EimzoKey } from 'eimzo-ts';

async function loginWith(key: EimzoKey) {
  try {
    const user = await eimzo.login(key); // whatever your /api/eimzo/login returns
    return user;
  } catch (e) {
    if (isEimzoError(e, 'CANCELLED')) return null;
    throw new Error(eimzo.t(e));
  }
}
```

## Sign a document with a timestamp and send it

```ts
await eimzo.loadKey(key); // once; later signatures reuse the keyId
const pkcs7 = await eimzo.signDocument(JSON.stringify({ id: docId, nonce: crypto.randomUUID(), body }));
await fetch(`/api/documents/${docId}/sign`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: pkcs7 });
```

Put a unique ID into the signed content so the backend can reject a replayed signature.

## Sign a file (detached)

```ts
const file = input.files![0];
const pkcs7 = await eimzo.signFile(file, { maxSize: 20 * 1024 * 1024 });
// send both the file and pkcs7; the backend verifies with /backend/pkcs7/verify/detached
```

## Logout

```ts
await eimzo.unloadKey();
```

## Angular service

```ts
import { Injectable } from '@angular/core';
import { createEimzo, createFetchBackend, DEV_API_KEYS } from 'eimzo-ts';

@Injectable({ providedIn: 'root' })
export class EimzoService {
  readonly client = createEimzo({
    apiKeys: { ...DEV_API_KEYS },
    backend: createFetchBackend({ challengeUrl: '/api/eimzo/challenge', loginUrl: '/api/eimzo/login' }),
  });
}
```

To reuse `HttpClient` interceptors, pass a custom backend:

```ts
backend: {
  getChallenge: () => firstValueFrom(this.http.get<{ challenge: string }>('/api/eimzo/challenge')).then((r) => r.challenge),
  login: (pkcs7) => firstValueFrom(this.http.post('/api/eimzo/login', pkcs7, { headers: { 'Content-Type': 'text/plain' } })),
}
```

## React

```tsx
import { useEffect, useState } from 'react';
import type { EimzoKey } from 'eimzo-ts';
import { eimzo } from './eimzo';

export function KeyPicker({ onPick }: { onPick: (k: EimzoKey) => void }) {
  const [keys, setKeys] = useState<EimzoKey[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => { eimzo.listKeys().then(setKeys, (e) => setError(eimzo.t(e))); }, []);
  if (error) return <p role="alert">{error}</p>;
  return (
    <ul>
      {keys.map((k) => (
        <li key={k.serialNumber}>
          <button disabled={k.expired} onClick={() => onPick(k)}>{k.CN} — {k.TIN || k.PINFL}</button>
        </li>
      ))}
    </ul>
  );
}
```

In Next.js, put this in a `'use client'` component.

## Vue

```ts
import { onMounted, ref } from 'vue';
import type { EimzoKey } from 'eimzo-ts';
import { eimzo } from './eimzo';

const keys = ref<EimzoKey[]>([]);
onMounted(async () => { keys.value = await eimzo.listKeys(); });
```

## Unit test with a fake transport

```ts
import { createEimzo } from 'eimzo-ts';

const eimzo = createEimzo({
  transport: async (req) => {
    const name = req.plugin ? `${req.plugin}.${req.name}` : req.name;
    switch (name) {
      case 'version': return { success: true, major: '6', minor: '3' };
      case 'pfx.list_all_certificates': return { success: true, certificates: [] };
      case 'pfx.load_key': return { success: true, keyId: 'K1' };
      case 'pkcs7.create_pkcs7': return { success: true, pkcs7_64: 'MIAG...' };
      default: return { success: false, reason: `not mocked: ${name}` };
    }
  },
});
```

Simulate the user cancelling: `{ success: false, status: -5000, reason: 'Ввод пароля отменен' }` → `CANCELLED`.
