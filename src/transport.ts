import { abortable, abortReason, type EimzoCallOptions } from './abort';
import { EimzoError, notInstalledError } from './errors';

export interface EimzoRequest {
  plugin?: string;
  name: string;
  arguments?: unknown[];
}

export interface EimzoResponse {
  success: boolean;
  reason?: string;
  // Ответы плагинов E-IMZO разнородны: поля читаются как `unknown` и проверяются
  // на месте; для типизации ответа `call()` служит обобщение `call<R>()`.
  [key: string]: unknown;
}

/**
 * Один вызов функции E-IMZO. Подменяется в тестах или для нестандартного окружения.
 * `options.signal` необязателен для своих реализаций: без него отмена срабатывает
 * только между вызовами.
 */
export type Transport = (request: EimzoRequest, options?: EimzoCallOptions) => Promise<EimzoResponse>;

export interface WebSocketTransportOptions {
  /** По умолчанию выбирается по протоколу страницы, см. `defaultEimzoUrl()`. */
  url?: string;
  /**
   * Таймаут одного вызова, мс. По умолчанию не ограничен: `create_pkcs7`
   * ждёт, пока пользователь введёт пароль. Работает и через EIMZOEXT;
   * завершает ожидание ответа, но не гарантирует отмену операции в E-IMZO.
   */
  timeoutMs?: number;
  /** Реализация WebSocket, если глобальной нет. */
  WebSocketImpl?: typeof WebSocket;
}

/** Совместимый с `CAPIWS` объект; так устроено браузерное расширение `EIMZOEXT`. */
export interface CapiwsLike {
  callFunction(def: EimzoRequest, onSuccess: (event: unknown, data: EimzoResponse) => void, onError: (code?: number) => void): void;
  version(onSuccess: (event: unknown, data: EimzoResponse) => void, onError: (code?: number) => void): void;
  apikey(keys: unknown[], onSuccess: (event: unknown, data: EimzoResponse) => void, onError: (code?: number) => void): void;
}

export function defaultEimzoUrl(): string {
  const https = typeof location !== 'undefined' && location.protocol.toLowerCase() === 'https:';
  return (https ? 'wss://127.0.0.1:64443' : 'ws://127.0.0.1:64646') + '/service/cryptapi';
}

/** Страница или Web Worker. На сервере (SSR) E-IMZO недоступен: он работает на компьютере пользователя. */
function isBrowserLike(): boolean {
  return typeof window !== 'undefined' || typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined';
}

/** Как `CAPIWS` в e-imzo.js: одно WebSocket-соединение на каждый вызов. */
export function createWebSocketTransport(options: WebSocketTransportOptions = {}): Transport {
  return (request, { signal } = {}) =>
    new Promise<EimzoResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortReason(signal));
        return;
      }
      // Свой `WebSocketImpl` — явное согласие: Node-скрипты, тесты.
      if (!options.WebSocketImpl && !isBrowserLike()) {
        reject(new EimzoError('NOT_IN_BROWSER'));
        return;
      }
      const WS = options.WebSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (!WS) {
        reject(new EimzoError('WEBSOCKET_UNSUPPORTED'));
        return;
      }

      let socket: WebSocket;
      try {
        socket = new WS(options.url ?? defaultEimzoUrl());
      } catch (e) {
        reject(notInstalledError(undefined, e));
        return;
      }

      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        settle(() => reject(abortReason(signal!)));
        socket.close();
      };
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      if (options.timeoutMs) {
        timer = setTimeout(() => {
          settle(() => reject(new EimzoError('TIMEOUT')));
          socket.close();
        }, options.timeoutMs);
      }

      socket.onopen = () => {
        if (settled) return;
        try {
          socket.send(JSON.stringify(request));
        } catch (cause) {
          settle(() => reject(new EimzoError('EIMZO_ERROR', { reason: 'failed to send request' }, { cause })));
          socket.close();
        }
      };
      socket.onmessage = (event) => {
        settle(() => {
          try {
            resolve(JSON.parse(event.data as string) as EimzoResponse);
          } catch (e) {
            reject(new EimzoError('EIMZO_ERROR', { reason: 'invalid JSON response' }, { cause: e }));
          }
        });
        socket.close();
      };
      // Ошибка соединения: `close` обычно следует за ней, но не ждём его.
      socket.onerror = () => {
        settle(() => reject(notInstalledError()));
        socket.close();
      };
      // Закрытие до ответа — значит E-IMZO недоступен.
      socket.onclose = (event) => settle(() => reject(notInstalledError(event.code)));
    });
}

export function createCapiwsTransport(capiws: CapiwsLike, options: Pick<WebSocketTransportOptions, 'timeoutMs'> = {}): Transport {
  return (request, { signal } = {}) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Расширение не умеет отменять вызов: отмена только прекращает ожидание ответа.
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    const call = new Promise<EimzoResponse>((resolve, reject) => {
      if (options.timeoutMs) {
        timer = setTimeout(() => reject(new EimzoError('TIMEOUT')), options.timeoutMs);
      }
      const ok = (_event: unknown, data: EimzoResponse) => resolve(data);
      const fail = (code?: number) => reject(notInstalledError(code));
      if (!request.plugin && request.name === 'version') capiws.version(ok, fail);
      else if (!request.plugin && request.name === 'apikey') capiws.apikey(request.arguments ?? [], ok, fail);
      else capiws.callFunction(request, ok, fail);
    });
    return abortable(call, signal).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  };
}

/**
 * Через расширение `EIMZOEXT`, если оно есть на странице, иначе через WebSocket.
 * Проверка на каждом вызове: расширение может внедриться после загрузки скрипта.
 */
export function createDefaultTransport(options: WebSocketTransportOptions = {}): Transport {
  const ws = createWebSocketTransport(options);
  return (request, callOptions) => {
    const ext = (globalThis as { EIMZOEXT?: CapiwsLike }).EIMZOEXT;
    return ext ? createCapiwsTransport(ext, options)(request, callOptions) : ws(request, callOptions);
  };
}
