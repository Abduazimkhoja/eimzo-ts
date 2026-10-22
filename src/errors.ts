import { ru } from './locales';
import { renderMessage } from './messages';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type NoParams = {};

/** Параметры, которые подставляются в текст ошибки, по каждому коду. */
export interface EimzoErrorParams {
  /** E-IMZO.exe не запущен или не установлен (WebSocket не открылся). */
  NOT_INSTALLED: NoParams;
  /** Браузер не поддерживает WebSocket. */
  WEBSOCKET_UNSUPPORTED: NoParams;
  /** Вызов на сервере (SSR): E-IMZO работает на компьютере пользователя, а не на сервере. */
  NOT_IN_BROWSER: NoParams;
  /** E-IMZO не ответил за `timeoutMs`. */
  TIMEOUT: NoParams;
  /** Установленная версия E-IMZO ниже `minVersion`. */
  OUTDATED_VERSION: { installed: string; min: string };
  /** E-IMZO отклонил API-KEY для домена страницы. */
  API_KEY_REJECTED: NoParams;
  /** Неверный пароль PFX-ключа. */
  WRONG_PASSWORD: NoParams;
  /** Пользователь закрыл окно пароля/PIN. Обычно это не ошибка, показывать не нужно. */
  CANCELLED: NoParams;
  /** E-IMZO не знает этот `keyId`: прошло 24 часа, ключ выгружен или E-IMZO перезапущен. */
  KEY_NOT_FOUND: NoParams;
  /** Файл больше `maxSize` в `signFile()`. Размеры в байтах. */
  FILE_TOO_LARGE: { size: number; max: number };
  /** `sign()` вызван до `loadKey()`. */
  KEY_NOT_LOADED: NoParams;
  /** В `options.backend` нет нужных методов — ошибка в коде приложения. */
  BACKEND_NOT_CONFIGURED: { methods: string };
  /** Backend ответил ошибкой или некорректными данными. */
  BACKEND_ERROR: { status?: number; detail?: string };
  /** Прочие ошибки E-IMZO; исходный текст — в `reason`. */
  EIMZO_ERROR: { reason?: string };
}

export type EimzoErrorCode = keyof EimzoErrorParams;

/** Ключи текстов: коды ошибок и варианты кодов с необязательными параметрами. */
export type EimzoMessageKey = EimzoErrorCode | 'BACKEND_ERROR_DETAIL' | 'BACKEND_ERROR_STATUS' | 'EIMZO_ERROR_REASON';

/** Словарь сообщений: шаблон на каждый ключ, параметры подставляются как `{name}`. */
export type EimzoMessages = Record<EimzoMessageKey, string>;

export interface EimzoErrorDetails {
  /** Текст ошибки от E-IMZO (`data.reason`), не переводится. */
  reason?: string;
  /** Числовой `status` из ответа E-IMZO. */
  status?: number;
  /** Код закрытия WebSocket. */
  wsCode?: number;
  /** HTTP-статус ответа backend. */
  httpStatus?: number;
  cause?: unknown;
}

type ParamsArg<C extends EimzoErrorCode> = keyof EimzoErrorParams[C] extends never
  ? [params?: EimzoErrorParams[C], details?: EimzoErrorDetails]
  : [params: EimzoErrorParams[C], details?: EimzoErrorDetails];

/**
 * Ошибка библиотеки. Для логики используйте `code` и `params`.
 * `message` — текст на языке экземпляра `Eimzo` (по умолчанию на русском);
 * чтобы перевести на другой язык, используйте `eimzo.t(error)` или `formatEimzoError()`.
 */
export class EimzoError<C extends EimzoErrorCode = EimzoErrorCode> extends Error {
  readonly code: C;
  readonly params: EimzoErrorParams[C];
  readonly reason?: string;
  readonly status?: number;
  readonly wsCode?: number;
  readonly httpStatus?: number;

  constructor(code: C, ...[params, details = {}]: ParamsArg<C>) {
    const p = (params ?? {}) as EimzoErrorParams[C];
    super(renderMessage(code, p, [ru]));
    this.name = 'EimzoError';
    this.code = code;
    this.params = p;
    this.reason = details.reason;
    this.status = details.status;
    this.wsCode = details.wsCode;
    this.httpStatus = details.httpStatus;
    if (details.cause !== undefined) (this as { cause?: unknown }).cause = details.cause;
  }
}

export function isEimzoError<C extends EimzoErrorCode>(error: unknown, code?: C): error is EimzoError<C> {
  return error instanceof EimzoError && (code === undefined || error.code === code);
}

export function notInstalledError(wsCode?: number, cause?: unknown): EimzoError<'NOT_INSTALLED'> {
  return new EimzoError('NOT_INSTALLED', {}, { wsCode, cause });
}

// Коды `status` E-IMZO, проверенные на E-IMZO 6.3.5.
const STATUS_KEY_NOT_FOUND = [-1010, -1014];
// -5000 «Ввод пароля отменен»: кнопка «Отмена» в окне пароля.
const STATUS_CANCELLED = [-5000];
// Неверный пароль PFX. Старые версии: BadPaddingException. E-IMZO 6.3 — status -9999 с текстом
// «Sequence tag error» или «getSecretKey failed: Password is not ASCII» (пароль в другой раскладке).
// -9999 бывает и у других ошибок, поэтому сверяем текст.
const WRONG_PASSWORD_REASONS = /BadPaddingException|Sequence tag error|getSecretKey failed/;

/** Превращает неуспешный ответ E-IMZO (`status`, `reason`) в типизированную ошибку. */
export function errorFromResponse(res: { status?: number; reason?: string }): EimzoError {
  const { status, reason } = res;
  const details = { reason, status };
  if (reason && WRONG_PASSWORD_REASONS.test(reason)) return new EimzoError('WRONG_PASSWORD', {}, details);
  if (status !== undefined && STATUS_KEY_NOT_FOUND.indexOf(status) !== -1) {
    return new EimzoError('KEY_NOT_FOUND', {}, details);
  }
  if (status !== undefined && STATUS_CANCELLED.indexOf(status) !== -1) return new EimzoError('CANCELLED', {}, details);
  return new EimzoError('EIMZO_ERROR', { reason }, details);
}
