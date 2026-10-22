import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEimzo, createWebSocketTransport } from '../src';

// Окружение vitest по умолчанию — node: так выглядит сервер при SSR.
describe('SSR', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('импорт и создание экземпляра на сервере не бросают', () => {
    expect(() => createEimzo()).not.toThrow();
  });

  it('вызов на сервере без WebSocketImpl — NOT_IN_BROWSER', async () => {
    await expect(createEimzo().init()).rejects.toMatchObject({ code: 'NOT_IN_BROWSER' });
    await expect(createWebSocketTransport()({ name: 'version' })).rejects.toMatchObject({ code: 'NOT_IN_BROWSER' });
  });

  it('свой WebSocketImpl разрешает работу вне браузера', async () => {
    class FakeWS {
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onopen?.());
      }
      send() {
        queueMicrotask(() => this.onmessage?.({ data: '{"success":true}' }));
      }
      close() {}
    }
    const transport = createWebSocketTransport({ WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    expect(await transport({ name: 'version' })).toEqual({ success: true });
  });

  it('в браузере без WebSocket — WEBSOCKET_UNSUPPORTED, а не NOT_IN_BROWSER', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('WebSocket', undefined);
    await expect(createWebSocketTransport()({ name: 'version' })).rejects.toMatchObject({ code: 'WEBSOCKET_UNSUPPORTED' });
  });

  it('Web Worker считается браузером', async () => {
    vi.stubGlobal('WorkerGlobalScope', class {});
    vi.stubGlobal('WebSocket', undefined);
    await expect(createWebSocketTransport()({ name: 'version' })).rejects.toMatchObject({ code: 'WEBSOCKET_UNSUPPORTED' });
  });
});
