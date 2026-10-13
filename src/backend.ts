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
   * Без `serverField` — ответ приложения (`login`): JSON возвращается как есть, `204` — `null`.
   * С `serverField` — формат e-imzo-server: `status`, если есть, равен `1`, а поле
   * `serverField` — непустая строка; она и возвращается.
   */
  async function request(url: string, init: RequestInit): Promise<unknown>;
  async function request(url: string, init: RequestInit, serverField: 'challenge' | 'pkcs7b64'): Promise<string>;
  async function request(url: string, init: RequestInit, serverField?: 'challenge' | 'pkcs7b64'): Promise<unknown> {
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
    const httpStatus = response.status;
    if (response.ok && httpStatus === 204 && !serverField) return null;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (cause) {
      if (response.ok) throw new EimzoError('BACKEND_ERROR', { detail: 'invalid JSON response' }, { httpStatus, cause });
    }
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined;
    const message = typeof record?.message === 'string' && record.message ? record.message : undefined;
    if (!response.ok) {
      throw new EimzoError('BACKEND_ERROR', { status: httpStatus, detail: message }, { httpStatus });
    }
    if (!serverField) return body;
    if (record && 'status' in record && record.status !== 1) {
      const detail = message ?? `status ${String(record.status)}`;
      throw new EimzoError('BACKEND_ERROR', { status: httpStatus, detail }, { httpStatus });
    }
    const value = record?.[serverField];
    if (typeof value !== 'string' || !value) {
      throw new EimzoError('BACKEND_ERROR', { detail: `no "${serverField}" field in response` }, { httpStatus });
    }
    return value;
  }

  const post = (pkcs7: string, signal: AbortSignal | undefined): RequestInit => ({
    method: 'POST',
    body: pkcs7,
    headers: { 'Content-Type': 'text/plain' },
    signal,
  });

  const backend: EimzoBackend<TLogin> = {};
  const { challengeUrl, loginUrl, timestampUrl } = options;
  if (challengeUrl) {
    backend.getChallenge = (callOptions) =>
      request(challengeUrl, { method: 'GET', cache: 'no-store', signal: callOptions?.signal }, 'challenge');
  }
  if (loginUrl) {
    backend.login = async (pkcs7, callOptions) => (await request(loginUrl, post(pkcs7, callOptions?.signal))) as TLogin;
  }
  if (timestampUrl) {
    backend.timestamp = (pkcs7, callOptions) => request(timestampUrl, post(pkcs7, callOptions?.signal), 'pkcs7b64');
  }
  return backend;
}
