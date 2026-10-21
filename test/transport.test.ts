import { describe, expect, it, vi } from 'vitest';
import { createCapiwsTransport, createDefaultTransport, createFetchBackend, createWebSocketTransport, type CapiwsLike } from '../src';

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
  it.each(['serialize', 'send'])('ошибка %s отклоняет запрос и закрывает соединение', async (stage) => {
    let socket!: FakeWS;
    class FakeWS {
      onopen: (() => void) | null = null;
      constructor() { socket = this; }
      send() { throw new Error('send failed'); }
      close = vi.fn();
    }
    const transport = createWebSocketTransport({ WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    const result = transport({ name: 'custom', arguments: stage === 'serialize' ? [1n] : [] });
    expect(() => socket.onopen?.()).not.toThrow();
    await expect(result).rejects.toMatchObject({ code: 'EIMZO_ERROR' });
    expect(socket.close).toHaveBeenCalledOnce();
  });

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

  it('ошибка соединения без close — NOT_INSTALLED, сокет закрывается', async () => {
    let socket!: FakeWS;
    class FakeWS {
      onerror: (() => void) | null = null;
      constructor() { socket = this; }
      close = vi.fn();
    }
    const transport = createWebSocketTransport({ WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    const result = transport({ name: 'version' });
    socket.onerror?.();
    await expect(result).rejects.toMatchObject({ code: 'NOT_INSTALLED' });
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('таймаут', async () => {
    const { WS } = fakeWebSocket({ silent: true });
    const transport = createWebSocketTransport({ WebSocketImpl: WS, timeoutMs: 10 });
    await expect(transport({ name: 'version' })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('createCapiwsTransport', () => {
  it.each(['success', 'error', 'throw'])('очищает таймер после %s', async (outcome) => {
    vi.useFakeTimers();
    const cause = new Error('extension failed');
    const capiws: CapiwsLike = {
      version: (ok, fail) => {
        if (outcome === 'throw') throw cause;
        if (outcome === 'error') fail(1006);
        else ok(null, { success: true });
      },
      apikey: vi.fn(),
      callFunction: vi.fn(),
    };
    try {
      const result = createCapiwsTransport(capiws, { timeoutMs: 100 })({ name: 'version' });
      if (outcome === 'success') await expect(result).resolves.toEqual({ success: true });
      else if (outcome === 'error') await expect(result).rejects.toMatchObject({ code: 'NOT_INSTALLED', wsCode: 1006 });
      else await expect(result).rejects.toBe(cause);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('default transport применяет timeoutMs к расширению и игнорирует поздний ответ', async () => {
    vi.useFakeTimers();
    let reply!: Parameters<CapiwsLike['version']>[0];
    vi.stubGlobal('EIMZOEXT', {
      version: (ok: typeof reply) => { reply = ok; },
    });
    try {
      const result = createDefaultTransport({ timeoutMs: 10 })({ name: 'version' }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10);
      reply(null, { success: true });
      const outcome = await Promise.race([result, Promise.resolve('pending')]);
      expect(outcome).toMatchObject({ code: 'TIMEOUT' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

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
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'include' });
    expect(new Headers(fetch.mock.calls[0][1].headers).get('X-CSRF')).toBe('tok');
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: 'P',
    });
    expect(new Headers(fetch.mock.calls[1][1].headers).get('Content-Type')).toBe('text/plain');
    expect(new Headers(fetch.mock.calls[1][1].headers).get('X-CSRF')).toBe('tok');
  });

  it.each<{ headers: HeadersInit }>([
    { headers: { 'content-type': 'application/json' } },
    { headers: [['content-type', 'application/json']] },
    { headers: new Headers({ 'content-type': 'application/json' }) },
  ])('переопределяет Content-Type без дублирования: %s', async ({ headers }) => {
    const fetch = respond({ token: 'test' });
    await createFetchBackend({ loginUrl: '/l', init: { headers }, fetch }).login!('P');
    expect(new Headers(fetch.mock.calls[0][1].headers).get('content-type')).toBe('text/plain');
  });

  it.each(['<html>proxy fallback</html>', ''])('не принимает не-JSON за успешный вход: %s', async (body) => {
    const backend = createFetchBackend({ loginUrl: '/l', fetch: vi.fn().mockResolvedValue(new Response(body)) });
    await expect(backend.login!('P')).rejects.toMatchObject({ code: 'BACKEND_ERROR', httpStatus: 200 });
  });

  it('сохраняет HTTP-статус ошибки с HTML вместо JSON', async () => {
    const backend = createFetchBackend({ loginUrl: '/l', fetch: vi.fn().mockResolvedValue(new Response('<html>error</html>', { status: 502 })) });
    await expect(backend.login!('P')).rejects.toMatchObject({ code: 'BACKEND_ERROR', httpStatus: 502 });
  });

  it('возвращает JSON приложения без изменения', async () => {
    await expect(createFetchBackend({ loginUrl: '/l', fetch: respond({ token: 'test' }) }).login!('P')).resolves.toEqual({ token: 'test' });
  });

  it('ответ login с полем status возвращается как есть: формат e-imzo-server проверяется только у challenge и timestamp', async () => {
    const body = { status: 'ok', token: 't' };
    await expect(createFetchBackend({ loginUrl: '/l', fetch: respond(body) }).login!('P')).resolves.toEqual(body);
  });

  it('login: 204 No Content (сессия в cookie) — null', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createFetchBackend({ loginUrl: '/l', fetch }).login!('P')).resolves.toBeNull();
  });

  it('timestamp без status: 1 — BACKEND_ERROR', async () => {
    const backend = createFetchBackend({ timestampUrl: '/t', fetch: respond({ status: -10, message: 'tsa down' }) });
    await expect(backend.timestamp!('P')).rejects.toMatchObject({ code: 'BACKEND_ERROR', params: { detail: 'tsa down' } });
  });

  it.each([
    ['challenge', { status: 1, challenge: '' }],
    ['challenge', { challenge: 42 }],
    ['timestamp', { status: 1, pkcs7b64: '' }],
    ['timestamp', { status: 1 }],
  ] as const)('%s: пустое или нестроковое поле — BACKEND_ERROR (%j)', async (kind, body) => {
    const backend = createFetchBackend({ challengeUrl: '/c', timestampUrl: '/t', fetch: respond(body) });
    const call = kind === 'challenge' ? backend.getChallenge!() : backend.timestamp!('P');
    await expect(call).rejects.toMatchObject({ code: 'BACKEND_ERROR', httpStatus: 200 });
  });

  it('challenge без поля status принимается (совместимость с 0.1.x)', async () => {
    await expect(createFetchBackend({ challengeUrl: '/c', fetch: respond({ challenge: 'c1' }) }).getChallenge!()).resolves.toBe('c1');
  });

  it('сетевая ошибка — BACKEND_ERROR с исходной ошибкой в cause', async () => {
    const cause = new TypeError('Failed to fetch');
    const backend = createFetchBackend({ loginUrl: '/l', fetch: vi.fn().mockRejectedValue(cause) });
    const error = await backend.login!('P').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'BACKEND_ERROR', params: { detail: 'Failed to fetch' } });
    expect((error as Error).cause).toBe(cause);
  });

  it('передаёт signal в fetch; отмена — причина отмены, а не BACKEND_ERROR', async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      controller.abort();
      return Promise.reject(init!.signal!.reason);
    });
    const backend = createFetchBackend({ challengeUrl: '/c', fetch });
    await expect(backend.getChallenge!({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch.mock.calls[0][1]!.signal).toBe(controller.signal);
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
