/*
 * Имитация E-IMZO для примеров без установленного приложения (порт demo/mock-eimzo.js).
 * createMockTransport() передаётся в createEimzo({ transport }) вместо WebSocket.
 *
 * Единственный источник: examples/_shared/. В каждый пример файл копирует `npm run examples:sync`.
 *
 * Ключи и сертификат — вымышленные. «Подпись» — правильная по структуре CMS SignedData,
 * но вместо подписи случайные байты: проверку на e-imzo-server она не пройдёт.
 */
import type { Transport } from 'eimzo-ts';

// Самоподписанный сертификат TESTOV TEST, ПИНФЛ 30101900000000, UID 123456789.
const CERT_B64 =
  'MIICjzCCAjWgAwIBAgIUWlcZzOsAIOUCetZAiiesc8TlACAwCgYIKoZIzj0EAwIwgbUxCzAJBgNVBAYTAlVaMREwDwYDVQQHDAhUT1NIS0VOVDESMBAGA1UECgwJREVNTyBNQ0hKMREwDwYDVQQMDAhESVJFS1RPUjEUMBIGA1UEAwwLVEVTVE9WIFRFU1QxDzANBgNVBAQMBlRFU1RPVjENMAsGA1UEKgwEVEVTVDEZMBcGCgmSJomT8ixkAQEMCTEyMzQ1Njc4OTEbMBkGByqGXAMQAQIMDjMwMTAxOTAwMDAwMDAwMB4XDTI2MTAxMzA2MzYxNloXDTI5MTAxMjA2MzYxNlowgbUxCzAJBgNVBAYTAlVaMREwDwYDVQQHDAhUT1NIS0VOVDESMBAGA1UECgwJREVNTyBNQ0hKMREwDwYDVQQMDAhESVJFS1RPUjEUMBIGA1UEAwwLVEVTVE9WIFRFU1QxDzANBgNVBAQMBlRFU1RPVjENMAsGA1UEKgwEVEVTVDEZMBcGCgmSJomT8ixkAQEMCTEyMzQ1Njc4OTEbMBkGByqGXAMQAQIMDjMwMTAxOTAwMDAwMDAwMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBqFwX3IEecqmFq26au/D355l5tNi6V7LYHhynyXmTe5y2QMMbr5pavz3TZgrKttMx1feomb4IYO72pkh6PqgyaMhMB8wHQYDVR0OBBYEFM61dF5ounx6VVBG8RfrKK8LV3myMAoGCCqGSM49BAMCA0gAMEUCIEBD1pcRwhoeme1KECI8+CLB/FM7ED1WlTvMIaZrjnNbAiEAi0d+QTgim3Mgrcta6S8DfdzLuHpbw05gDrldQw4nzr0=';

// Так E-IMZO отдаёт alias: в нижнем регистре, даты «ГГГГ.ММ.ДД ЧЧ:ММ:СС».
const CERTIFICATES = [
  {
    disk: 'C:\\',
    path: 'DSKEYS',
    name: 'DS301019000000000001',
    alias:
      'cn=testov test,name=test,surname=testov,l=toshkent,c=uz,o=demo mchj,t=direktor,uid=123456789,' +
      '1.2.860.3.16.1.2=30101900000000,serialnumber=5a5719cceb0020e5027ad6408a27ac73c4e50020,' +
      'validfrom=2026.10.13 06:36:16,validto=2029.10.12 06:36:16',
  },
  {
    disk: 'C:\\',
    path: 'DSKEYS',
    name: 'DS302029000000000002',
    alias:
      'cn=eskiyev eski,name=eski,surname=eskiyev,c=uz,uid=987654321,1.2.860.3.16.1.2=30202900000000,' +
      'serialnumber=1f2e3d,validfrom=2021.01.01 00:00:00,validto=2023.01.01 23:59:59',
  },
];

// ---------- DER ----------

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function tlv(tag: number, parts: Uint8Array[]): Uint8Array {
  const body = concat(parts);
  const len = body.length;
  let lenBytes: number[];
  if (len < 0x80) {
    lenBytes = [len];
  } else {
    lenBytes = [];
    for (let n = len; n > 0; n = Math.floor(n / 256)) lenBytes.unshift(n & 0xff);
    lenBytes.unshift(0x80 | lenBytes.length);
  }
  return concat([new Uint8Array([tag, ...lenBytes]), body]);
}

function oid(dotted: string): Uint8Array {
  const [a = 0, b = 0, ...rest] = dotted.split('.').map(Number);
  let bytes = [a * 40 + b];
  for (let n of rest) {
    const chunk = [n & 0x7f];
    for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) chunk.unshift(0x80 | (n & 0x7f));
    bytes = bytes.concat(chunk);
  }
  return tlv(0x06, [new Uint8Array(bytes)]);
}

const seq = (...p: Uint8Array[]) => tlv(0x30, p);
const set = (...p: Uint8Array[]) => tlv(0x31, p);
const int = (n: number) => tlv(0x02, [new Uint8Array([n])]);
const octets = (bytes: Uint8Array) => tlv(0x04, [bytes]);

function utcTime(date: Date): Uint8Array {
  const s = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  return tlv(0x17, [new TextEncoder().encode(s)]);
}

/** Срез исходных байтов TLV по позиции. */
function readTlv(buf: Uint8Array, from: number): { start: number; valueStart: number; end: number } {
  let pos = from + 1;
  let len = buf[pos++] ?? 0;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + (buf[pos++] ?? 0);
  }
  return { start: from, valueStart: pos, end: pos + len };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const CERT = base64ToBytes(CERT_B64);

/** issuer и serialNumber из сертификата — для SignerInfo.sid. */
function issuerAndSerial(): Uint8Array {
  const tbs = readTlv(CERT, readTlv(CERT, 0).valueStart);
  const version = readTlv(CERT, tbs.valueStart);
  const serial = readTlv(CERT, version.end);
  const sigAlg = readTlv(CERT, serial.end);
  const issuer = readTlv(CERT, sigAlg.end);
  return seq(CERT.subarray(issuer.start, issuer.end), CERT.subarray(serial.start, serial.end));
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  }
  return new Uint8Array(32);
}

async function fakePkcs7(content: Uint8Array, detached: boolean): Promise<string> {
  const SHA256 = seq(oid('2.16.840.1.101.3.4.2.1'));
  const signedAttrs = [
    seq(oid('1.2.840.113549.1.9.3'), set(oid('1.2.840.113549.1.7.1'))),
    seq(oid('1.2.840.113549.1.9.5'), set(utcTime(new Date()))),
    seq(oid('1.2.840.113549.1.9.4'), set(octets(await sha256(content)))),
  ];
  const signature = crypto.getRandomValues(new Uint8Array(70));
  const signerInfo = seq(
    int(1),
    issuerAndSerial(),
    SHA256,
    tlv(0xa0, signedAttrs),
    seq(oid('1.2.840.10045.4.3.2')),
    octets(signature),
  );
  const encap = detached
    ? seq(oid('1.2.840.113549.1.7.1'))
    : seq(oid('1.2.840.113549.1.7.1'), tlv(0xa0, [octets(content)]));
  const signedData = seq(int(1), set(SHA256), encap, tlv(0xa0, [CERT]), set(signerInfo));
  return bytesToBase64(seq(oid('1.2.840.113549.1.7.2'), tlv(0xa0, [signedData])));
}

// ---------- E-IMZO ----------

type Handler = (args: unknown[]) => Record<string, unknown> | Promise<Record<string, unknown>>;

export function createMockTransport(options?: { delayMs?: number }): Transport {
  const delay = options?.delayMs ?? 400;
  const loaded = new Map<string, unknown>();
  let counter = 0;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const handlers: Record<string, Handler> = {
    version: () => ({ success: true, major: '6', minor: '3' }),
    apikey: () => ({ success: true }),
    'pfx.list_all_certificates': () => ({ success: true, certificates: CERTIFICATES }),
    'idcard.list_readers': () => ({ success: true, readers: [] }),
    'baikey.list_tokens': () => ({ success: true, tokens: [] }),
    'ckc.list_ckc': () => ({ success: true, devices: [] }),
    'pfx.load_key': (args) => {
      const keyId = `mock-${++counter}`;
      loaded.set(keyId, args[3]);
      return { success: true, keyId };
    },
    'pfx.verify_password': () => ({ success: true }),
    'pfx.unload_key': (args) => {
      if (!loaded.delete(String(args[0]))) {
        return { success: false, status: -1014, reason: "Идентификатор ключа типа 'PFX_KEY_STORE' не найден" };
      }
      return { success: true };
    },
    'pkcs7.create_pkcs7': async (args) => {
      if (!loaded.has(String(args[1]))) return { success: false, status: -1010, reason: 'Ключ по идентификатору не найден' };
      await wait(delay); // «пользователь вводит пароль»
      return { success: true, pkcs7_64: await fakePkcs7(base64ToBytes(String(args[0])), args[2] === 'yes') };
    },
  };

  return async (request) => {
    const name = request.plugin ? `${request.plugin}.${request.name}` : request.name;
    const handler = handlers[name];
    if (!handler) return { success: false, status: 0, reason: 'Функция не найдена или версия E-IMZO устарела. Обновите E-IMZO.' };
    return { ...(await handler(request.arguments ?? [])) } as Awaited<ReturnType<Transport>>;
  };
}
