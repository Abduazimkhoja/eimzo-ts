import { describe, expect, it, vi } from 'vitest';
import { createCapiwsTransport, createFetchBackend, createWebSocketTransport } from '../src';

type Behavior = { reply?: unknown; closeCode?: number; silent?: boolean };

function fakeWebSocket(behavior: Behavior) {
  const sent: string[] = [];
  class FakeWS {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    constructor(public url: string) {
      queueMicrotask(() => {
        if (behavior.closeCode) return this.onclose?.({ code: behavior.closeCode });
        this.onopen?.();
      });
    }
    send(data: string) {
      sent.push(data);
      if (!behavior.silent) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(behavior.reply) }));
    }
    close() {
      queueMicrotask(() => this.onclose?.({ code: 1000 }));
    }
  }
  return { WS: FakeWS as unknown as typeof WebSocket, sent };
}

describe('createWebSocketTransport', () => {
  it('отправляет запрос и возвращает ответ', async () => {
    const { WS, sent } = fakeWebSocket({ reply: { success: true, major: '4', minor: '86' } });
    const transport = createWebSocketTransport({ WebSocketImpl: WS, url: 'ws://test' });
    expect(await transport({ name: 'version' })).toEqual({ success: true, major: '4', minor: '86' });
    expect(JSON.parse(sent[0])).toEqual({ name: 'version' });
  });

  it('закрытие до ответа — NOT_INSTALLED с кодом', async () => {
    const { WS } = fakeWebSocket({ closeCode: 1006 });
    const transport = createWebSocketTransport({ WebSocketImpl: WS });
    await expect(transport({ name: 'version' })).rejects.toMatchObject({ code: 'NOT_INSTALLED', wsCode: 1006 });
  });

  it('таймаут', async () => {
    const { WS } = fakeWebSocket({ silent: true });
    const transport = createWebSocketTransport({ WebSocketImpl: WS, timeoutMs: 10 });
    await expect(transport({ name: 'version' })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('createCapiwsTransport', () => {
  it('version/apikey идут в свои методы, остальное — в callFunction', async () => {
    const ok = (_d: unknown, cb: (e: unknown, d: unknown) => void) => cb(null, { success: true });
    const capiws = {
      version: vi.fn((cb) => cb(null, { success: true })),
      apikey: vi.fn((_k, cb) => cb(null, { success: true })),
      callFunction: vi.fn(ok),
    };
    const t = createCapiwsTransport(capiws);
    await t({ name: 'version' });
    await t({ name: 'apikey', arguments: ['a', 'b'] });
    await t({ plugin: 'pfx', name: 'list_all_certificates' });
    expect(capiws.version).toHaveBeenCalledOnce();
    expect(capiws.apikey.mock.calls[0][0]).toEqual(['a', 'b']);
    expect(capiws.callFunction).toHaveBeenCalledOnce();
  });
});

describe('createFetchBackend', () => {
  const respond = (body: unknown, status = 200) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('getChallenge без кеша, timestamp отдаёт pkcs7b64', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, challenge: 'c1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, pkcs7b64: 'TS' })));
    const backend = createFetchBackend({
      challengeUrl: '/c',
      timestampUrl: '/t',
      init: { headers: { 'X-CSRF': 'tok' }, credentials: 'include' },
      fetch,
    });
    expect(await backend.getChallenge!()).toBe('c1');
    expect(await backend.timestamp!('P')).toBe('TS');
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'include', headers: { 'X-CSRF': 'tok' } });
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: 'P',
      headers: { 'X-CSRF': 'tok', 'Content-Type': 'text/plain' },
    });
  });

  it('HTTP-ошибка и status != 1 — BACKEND_ERROR', async () => {
    await expect(createFetchBackend({ loginUrl: '/l', fetch: respond({ message: 'no' }, 403) }).login!('P')).rejects.toMatchObject({
      code: 'BACKEND_ERROR',
      httpStatus: 403,
    });
    await expect(
      createFetchBackend({ challengeUrl: '/c', fetch: respond({ status: -1, message: 'vpn' }) }).getChallenge!(),
    ).rejects.toMatchObject({ code: 'BACKEND_ERROR', params: { detail: 'vpn' } });
  });
});
