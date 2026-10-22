/*
 * Единственный экземпляр Eimzo на приложение (иначе E-IMZO будет спрашивать пароль при каждой подписи).
 * Режим: ?mode=real|mock; по умолчанию настоящий E-IMZO только на localhost.
 *
 * Единственный источник: examples/_shared/. В каждый пример файл копирует `npm run examples:sync`.
 */
import { createEimzo, DEV_API_KEYS, isEimzoError } from 'eimzo-ts';
import { createMockTransport } from './mock-transport';

const isBrowser = typeof window !== 'undefined';
const isLocal = isBrowser && ['localhost', '127.0.0.1'].includes(location.hostname);

export const mode: 'real' | 'mock' = isBrowser
  ? ((new URLSearchParams(location.search).get('mode') as 'real' | 'mock' | null) ?? (isLocal ? 'real' : 'mock'))
  : 'mock';

// Создание экземпляра безопасно и на сервере: к E-IMZO обращаются только методы, а их зовут из браузера.
export const eimzo = createEimzo(mode === 'mock' ? { transport: createMockTransport() } : { apiKeys: DEV_API_KEYS });

/** Текст ошибки для пользователя; null — пользователь передумал, показывать нечего. */
export function errorText(e: unknown): string | null {
  if (isEimzoError(e, 'CANCELLED')) return null;
  return isEimzoError(e) ? `[${e.code}] ${eimzo.t(e)}` : String(e);
}
