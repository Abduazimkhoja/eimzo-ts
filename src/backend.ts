import type { EimzoCallOptions } from './abort';
import { EimzoError } from './errors';

/**
 * Связь с вашим backend. Библиотека не знает ваших адресов и формата ответа,
 * поэтому каждый шаг задаётся функцией. Нужны только те методы, которые вы вызываете:
 * `login()` требует `getChallenge` и `login`, `signDocument()` — `timestamp`.
 */
export interface EimzoBackend<TLogin = unknown> {
  /** Одноразовый challenge от e-imzo-server (`/frontend/challenge`). */
  getChallenge?(options?: EimzoCallOptions): Promise<string>;
  /** Отправить PKCS#7 с подписанным challenge; backend проверяет его через `/backend/auth`. */
  login?(pkcs7: string, options?: EimzoCallOptions): Promise<TLogin>;
  /** Прикрепить метку времени (`/frontend/timestamp/pkcs7`); вернуть PKCS#7 с меткой. */
  timestamp?(pkcs7: string, options?: EimzoCallOptions): Promise<string>;
}

export interface FetchBackendOptions {
  /** GET, ответ `{ challenge, status }`. */
  challengeUrl?: string;
  /**
   * POST, тело — PKCS#7 в base64 (text/plain). JSON-ответ возвращается из `login()` как есть,
   * `204 No Content` — как `null`. Пустой или не-JSON ответ `200` считается ошибкой.
   */
  loginUrl?: string;
  /** POST, тело — PKCS#7 в base64 (text/plain). Ответ `{ pkcs7b64, status }`. */
  timestampUrl?: string;
  /**
   * Общие параметры запросов: заголовки (CSRF, Authorization), `credentials` и т.п.
   * `signal` отдельного вызова заменяет `init.signal`, а не объединяется с ним.
   */
  init?: RequestInit;
  fetch?: typeof fetch;
}

/**
 * Backend на `fetch`. Форматы ответов совпадают с e-imzo-server, поэтому backend
 * может просто проксировать `/frontend/challenge` и `/frontend/timestamp/pkcs7`.
 */
export function createFetchBackend<TLogin = unknown>(options: FetchBackendOptions): EimzoBackend<TLogin> {
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const base = options.init ?? {};

  /**
   * `serverFormat`: ответ в формате e-imzo-server, `status` должен быть `1`.
   * Ответ `login` принадлежит приложению, его поле `status` не проверяется.
   */
  const request = async (url: string, init: RequestInit, serverFormat: boolean): Promise<unknown> => {
    const headers = new Headers(base.headers);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const signal = init.signal ?? base.signal ?? undefined;
    let response: Response;
    let text: string;
    try {
      response = await doFetch(url, { ...base, ...init, headers, signal });
      text = await response.text();
    } catch (cause) {
      // Отмена — не ошибка сервера: отдаём причину отмены, как fetch.
      if (signal?.aborted) throw cause;
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new EimzoError('BACKEND_ERROR', { detail }, { cause });
    }
    if (response.ok && response.status === 204) return null;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (cause) {
      if (response.ok) {
        throw new EimzoError('BACKEND_ERROR', { detail: 'invalid JSON response' }, { httpStatus: response.status, cause });
      }
    }
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && body.message
        ? body.message
        : undefined;
    if (!response.ok) {
      throw new EimzoError('BACKEND_ERROR', { status: response.status, detail: message }, { httpStatus: response.status });
    }
    if (serverFormat && body && typeof body === 'object' && 'status' in body && body.status !== 1) {
      const detail = message ?? `status ${String(body.status)}`;
      throw new EimzoError('BACKEND_ERROR', { status: response.status, detail }, { httpStatus: response.status });
    }
    return body;
  };

  const postPkcs7 = (url: string, pkcs7: string, serverFormat: boolean, signal?: AbortSignal) =>
    request(url, { method: 'POST', body: pkcs7, headers: { 'Content-Type': 'text/plain' }, signal }, serverFormat);

  const backend: EimzoBackend<TLogin> = {};
  if (options.challengeUrl) {
    const url = options.challengeUrl;
    backend.getChallenge = async (callOptions) => {
      const body = await request(url, { method: 'GET', cache: 'no-store', signal: callOptions?.signal }, true);
      if (!body || typeof body !== 'object' || !('challenge' in body) || typeof body.challenge !== 'string') {
        throw new EimzoError('BACKEND_ERROR', { detail: 'no "challenge" field in response' });
      }
      return body.challenge;
    };
  }
  if (options.loginUrl) {
    const url = options.loginUrl;
    backend.login = async (pkcs7, callOptions) => (await postPkcs7(url, pkcs7, false, callOptions?.signal)) as TLogin;
  }
  if (options.timestampUrl) {
    const url = options.timestampUrl;
    backend.timestamp = async (pkcs7, callOptions) => {
      const body = await postPkcs7(url, pkcs7, true, callOptions?.signal);
      if (!body || typeof body !== 'object' || !('pkcs7b64' in body) || typeof body.pkcs7b64 !== 'string') {
        throw new EimzoError('BACKEND_ERROR', { detail: 'no "pkcs7b64" field in response' });
      }
      return body.pkcs7b64;
    };
  }
  return backend;
}
