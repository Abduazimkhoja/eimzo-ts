import { EimzoError } from './errors';

/**
 * Связь с вашим backend. Библиотека не знает ваших адресов и формата ответа,
 * поэтому каждый шаг задаётся функцией. Нужны только те методы, которые вы вызываете:
 * `login()` требует `getChallenge` и `login`, `signDocument()` — `timestamp`.
 */
export interface EimzoBackend<TLogin = unknown> {
  /** Одноразовый challenge от e-imzo-server (`/frontend/challenge`). */
  getChallenge?(): Promise<string>;
  /** Отправить PKCS#7 с подписанным challenge; backend проверяет его через `/backend/auth`. */
  login?(pkcs7: string): Promise<TLogin>;
  /** Прикрепить метку времени (`/frontend/timestamp/pkcs7`); вернуть PKCS#7 с меткой. */
  timestamp?(pkcs7: string): Promise<string>;
}

export interface FetchBackendOptions {
  /** GET, ответ `{ challenge, status }`. */
  challengeUrl?: string;
  /** POST, тело — PKCS#7 в base64 (text/plain). Ответ возвращается из `login()` как есть. */
  loginUrl?: string;
  /** POST, тело — PKCS#7 в base64 (text/plain). Ответ `{ pkcs7b64, status }`. */
  timestampUrl?: string;
  /** Общие параметры запросов: заголовки (CSRF, Authorization), `credentials` и т.п. */
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

  const request = async (url: string, init: RequestInit): Promise<any> => {
    const response = await doFetch(url, {
      ...base,
      ...init,
      headers: { ...headersToObject(base.headers), ...headersToObject(init.headers) },
    });
    const text = await response.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // не JSON — вернём текст
    }
    if (!response.ok) {
      const detail = body && typeof body === 'object' && body.message ? String(body.message) : undefined;
      throw new EimzoError('BACKEND_ERROR', { status: response.status, detail }, { httpStatus: response.status });
    }
    if (body && typeof body === 'object' && 'status' in body && body.status !== 1) {
      const detail = body.message ? String(body.message) : `status ${body.status}`;
      throw new EimzoError('BACKEND_ERROR', { status: response.status, detail }, { httpStatus: response.status });
    }
    return body;
  };

  const postPkcs7 = (url: string, pkcs7: string) =>
    request(url, { method: 'POST', body: pkcs7, headers: { 'Content-Type': 'text/plain' } });

  const backend: EimzoBackend<TLogin> = {};
  if (options.challengeUrl) {
    const url = options.challengeUrl;
    backend.getChallenge = async () => {
      const body = await request(url, { method: 'GET', cache: 'no-store' });
      if (!body || typeof body.challenge !== 'string') {
        throw new EimzoError('BACKEND_ERROR', { detail: 'no "challenge" field in response' });
      }
      return body.challenge;
    };
  }
  if (options.loginUrl) {
    const url = options.loginUrl;
    backend.login = (pkcs7) => postPkcs7(url, pkcs7);
  }
  if (options.timestampUrl) {
    const url = options.timestampUrl;
    backend.timestamp = async (pkcs7) => {
      const body = await postPkcs7(url, pkcs7);
      if (!body || typeof body.pkcs7b64 !== 'string') {
        throw new EimzoError('BACKEND_ERROR', { detail: 'no "pkcs7b64" field in response' });
      }
      return body.pkcs7b64;
    };
  }
  return backend;
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => (result[key] = value));
    return result;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}
