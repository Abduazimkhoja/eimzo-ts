import { abortable, abortReason, throwIfAborted, type EimzoCallOptions } from './abort';
import { bytesToBase64, utf8ToBase64 } from './base64';
import type { EimzoBackend } from './backend';
import { parseCertificateInfo, type EimzoKey, type PfxKey, type TokenKey } from './certificate';
import { EimzoError, errorFromResponse, isEimzoError } from './errors';
import { DEFAULT_LOCALE, formatEimzoError, type EimzoLocale, type MessageOverrides } from './i18n';
import { createDefaultTransport, type EimzoResponse, type Transport, type WebSocketTransportOptions } from './transport';

/** Пары «домен → API-KEY» или плоский массив `[домен, ключ, домен, ключ, ...]`, как в демо. */
export type ApiKeys = Record<string, string> | string[];

/** Аппаратные носители: подписывают без `load_key`, `id` передаётся в `create_pkcs7` напрямую. */
export type DeviceType = 'idcard' | 'baikey' | 'ckc';

export interface EimzoVersion {
  major: number;
  minor: number;
}

export interface EimzoOptions<TLogin = unknown> extends WebSocketTransportOptions {
  /**
   * API-ключи доменов. Пусто — `apikey` не вызывается (E-IMZO v6 подбирает ключ по домену сам).
   * Для localhost используйте `DEV_API_KEYS`.
   */
  apiKeys?: ApiKeys;
  /** Минимальная версия E-IMZO, `"major.minor"`. По умолчанию `"4.86"`. */
  minVersion?: string;
  backend?: EimzoBackend<TLogin>;
  /** Своя реализация вызовов E-IMZO, например для тестов. */
  transport?: Transport;
  /**
   * Язык сообщений об ошибках: `'ru'` (по умолчанию), `'uz-Latn'`, `'uz-Cyrl'`, `'kaa'`, `'en'`
   * или свой код вместе с `messages`.
   */
  locale?: EimzoLocale;
  /**
   * Свои тексты: `{ ru: { WRONG_PASSWORD: () => '...' } }` заменяет одно сообщение,
   * `{ kk: { ... } }` добавляет язык. Недостающие сообщения берутся из русского.
   */
  messages?: MessageOverrides;
  /**
   * Если E-IMZO забыл `keyId` (24 часа, перезапуск E-IMZO), `sign()` сам загрузит
   * тот же ключ заново и повторит подпись. E-IMZO при этом снова спросит пароль.
   * По умолчанию `true`.
   */
  autoReloadKey?: boolean;
}

export interface LoadKeyOptions extends EimzoCallOptions {
  /**
   * Сразу спросить пароль/PIN (`verify_password` / `verify_pin`).
   * Внимание: `verify_password` не показывает флажок «Запомнить на 6 час.»
   * и сокращает уже запомненный пароль до 1 минуты.
   */
  verifyPassword?: boolean;
}

export interface SignOptions extends EimzoCallOptions {
  /** PKCS#7 без вложенных данных (detached). По умолчанию — с данными (attached). */
  detached?: boolean;
  /** Строка `data` уже в base64 (например, содержимое файла). */
  base64?: boolean;
  /** Подписать другим ключом, а не загруженным через `loadKey()`. */
  keyId?: string;
}

export type SignableData = string | Uint8Array | ArrayBuffer;

export interface SignFileOptions extends EimzoCallOptions {
  /** По умолчанию `true`: файл хранится у вас, класть его копию в подпись незачем. */
  detached?: boolean;
  /** Максимальный размер файла в байтах. По умолчанию 10 МБ. */
  maxSize?: number;
  /** Подписать другим ключом, а не загруженным через `loadKey()`. */
  keyId?: string;
}

export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Публичные ключи E-IMZO для локальной разработки (из официального примера). */
export const DEV_API_KEYS: Record<string, string> = {
  localhost:
    '96D0C1491615C82B9A54D9989779DF825B690748224C2B04F500F370D51827CE2644D8D4A82C18184D73AB8530BB8ED537269603F61DB0D03D2104ABF789970B',
  '127.0.0.1':
    'A7BCFA5D490B351BE0754130DF03A068F855DB4333D43921125B9CF2670EF6A40370C646B90401955E1F7BC9CDBF59CE0B2C5467D820BE189C845D0B79CFC96F',
};

const DEFAULT_MIN_VERSION = '4.86';
// Пороги из e-imzo-client.js (NEW_API2 / NEW_API3).
const VERSION_PFX_ONLY: EimzoVersion = { major: 4, minor: 12 };
const VERSION_BAIK_CKC: EimzoVersion = { major: 4, minor: 86 };

const atLeast = (v: EimzoVersion, min: EimzoVersion) =>
  v.major !== min.major ? v.major > min.major : v.minor >= min.minor;

// Поля ответов E-IMZO, которые читает клиент. Значения не доверяем: проверяем перед использованием.
interface VersionResponse { major?: string; minor?: string }
interface PfxEntry { disk: string; path: string; name: string; alias: string }
interface TokenEntry { cardUID: string; statusInfo: string; ownerName: string; info: string }

function parseVersion(value: string): EimzoVersion {
  const [major, minor] = value.split('.').map((part) => parseInt(part, 10));
  if (isNaN(major) || isNaN(minor)) throw new Error(`Invalid E-IMZO version: "${value}"`);
  return { major, minor };
}

function flattenApiKeys(keys: ApiKeys | undefined): string[] {
  if (!keys) return [];
  if (Array.isArray(keys)) return keys;
  return Object.keys(keys).reduce<string[]>((acc, domain) => acc.concat(domain, keys[domain]), []);
}

function toBase64(data: SignableData, alreadyBase64: boolean): string {
  if (typeof data === 'string') return alreadyBase64 ? data : utf8ToBase64(data);
  return bytesToBase64(data instanceof Uint8Array ? data : new Uint8Array(data));
}

export class Eimzo<TLogin = unknown> {
  private readonly transport: Transport;
  private readonly minVersion: EimzoVersion;
  private ready: Promise<EimzoVersion> | null = null;
  private currentKeyId: string | null = null;
  /** Ключ, из которого получен `currentKeyId`, — чтобы загрузить его заново. */
  private currentKey: EimzoKey | DeviceType | null = null;
  private currentLocale: EimzoLocale;
  /** Хвост очереди операций, которые могут открыть окно пароля. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: EimzoOptions<TLogin> = {}) {
    this.transport = options.transport ?? createDefaultTransport(options);
    this.minVersion = parseVersion(options.minVersion ?? DEFAULT_MIN_VERSION);
    this.currentLocale = options.locale ?? DEFAULT_LOCALE;
  }

  /** `keyId` последнего `loadKey()`. Держите его, чтобы работало запоминание пароля на 6 часов. */
  get keyId(): string | null {
    return this.currentKeyId;
  }

  get locale(): EimzoLocale {
    return this.currentLocale;
  }

  /** Сменить язык. Влияет на `t()` и на `message` следующих ошибок. */
  setLocale(locale: EimzoLocale): void {
    this.currentLocale = locale;
  }

  /**
   * Текст ошибки на текущем (или указанном) языке. Используйте при показе, а не
   * `error.message`: так после смены языка старая ошибка тоже покажется на новом.
   */
  t(error: unknown, locale: EimzoLocale = this.currentLocale): string {
    return formatEimzoError(error, locale, this.options.messages);
  }

  /** Все публичные методы проходят через guard: `message` ошибки — на текущем языке. */
  private guard<T>(work: () => Promise<T>): Promise<T> {
    return work().catch((error: unknown) => {
      if (error instanceof EimzoError) error.message = this.t(error);
      throw error;
    });
  }

  /**
   * Операции, которые могут открыть окно пароля, выполняются строго по одной:
   * двойной клик по «Подписать» не откроет два окна, второй вызов дождётся первого.
   * Отмена сразу отклоняет Promise вызывающего. Операция, ждущая в очереди, не запускается.
   * У запущенной вызов E-IMZO не обрывается (окно пароля уже может быть открыто),
   * следующие шаги пропускаются, а очередь ждёт ответа E-IMZO — второго окна не будет.
   * Поэтому внутри очереди `signal` проверяется между шагами и передаётся только в backend.
   */
  private exclusive<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const start = () => {
      throwIfAborted(signal);
      return work();
    };
    const run = this.queue.then(start, start);
    this.queue = run.catch(() => undefined);
    return this.guard(() => abortable(run, signal));
  }

  /**
   * Проверяет версию и устанавливает API-ключи. Вызывается автоматически перед любой
   * операцией; результат кешируется, после ошибки следующий вызов пробует заново.
   * Отмена прекращает ожидание только для этого вызова: проверка общая для всех.
   */
  init(options: EimzoCallOptions = {}): Promise<EimzoVersion> {
    return this.guard(() => this.whenReady(options.signal));
  }

  private whenReady(signal?: AbortSignal): Promise<EimzoVersion> {
    // До запуска init: иначе отказ общего init остался бы без обработчика.
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (!this.ready) {
      this.ready = this.doInit().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    return abortable(this.ready, signal);
  }

  private async doInit(): Promise<EimzoVersion> {
    const version = await this.readVersion();
    if (!atLeast(version, this.minVersion)) {
      throw new EimzoError('OUTDATED_VERSION', {
        installed: `${version.major}.${version.minor}`,
        min: `${this.minVersion.major}.${this.minVersion.minor}`,
      });
    }
    const apiKeys = flattenApiKeys(this.options.apiKeys);
    if (apiKeys.length > 0) {
      const res = await this.transport({ name: 'apikey', arguments: apiKeys });
      if (!res.success) throw new EimzoError('API_KEY_REJECTED', {}, { reason: res.reason });
    }
    return version;
  }

  /** Версия установленного E-IMZO. Не требует API-ключа. */
  getVersion(options: EimzoCallOptions = {}): Promise<EimzoVersion> {
    return this.guard(() => this.readVersion(options.signal));
  }

  private async readVersion(signal?: AbortSignal): Promise<EimzoVersion> {
    const res: EimzoResponse & VersionResponse = await this.transport({ name: 'version' }, { signal });
    if (!res.success) throw errorFromResponse(res);
    const major = parseInt(res.major ?? '', 10);
    const minor = parseInt(res.minor ?? '', 10);
    if (isNaN(major) || isNaN(minor)) throw new EimzoError('EIMZO_ERROR', { reason: 'version is undefined' });
    return { major, minor };
  }

  /**
   * Прямой вызов функции плагина E-IMZO (см. http://127.0.0.1:64646/apidoc.html).
   * Не встаёт в очередь `sign()`/`loadKey()`: функции, открывающие окно пароля,
   * не вызывайте параллельно с ними.
   */
  call(plugin: string, name: string, args: unknown[] = [], options: EimzoCallOptions = {}): Promise<EimzoResponse> {
    return this.guard(() => this.invoke(plugin, name, args, options.signal));
  }

  /** `R` — поля ответа, которые читает вызывающий код. */
  private async invoke<R = object>(
    plugin: string,
    name: string,
    args: unknown[] = [],
    signal?: AbortSignal,
  ): Promise<EimzoResponse & R> {
    await this.whenReady(signal);
    const res = await this.transport({ plugin, name, arguments: args }, { signal });
    if (!res.success) throw errorFromResponse(res);
    return res as EimzoResponse & R;
  }

  /** PFX-ключи (и токены `ftjc` для E-IMZO старше 4.12). Ключи без ИНН и ПИНФЛ пропускаются. */
  listKeys(options: EimzoCallOptions = {}): Promise<EimzoKey[]> {
    const { signal } = options;
    return this.guard(async () => {
      const version = await this.whenReady(signal);
      const sources: Promise<EimzoKey[]>[] = [this.listPfx(signal)];
      if (!atLeast(version, VERSION_PFX_ONLY)) sources.push(this.listTokens(signal));

      const results = await Promise.allSettled(sources);
      const keys = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      const failure = results.find((r) => r.status === 'rejected');
      throwIfAborted(signal);
      // Как в оригинале: ошибка, только если ничего не нашлось.
      if (keys.length === 0 && failure) throw failure.reason;
      return keys;
    });
  }

  private async listPfx(signal?: AbortSignal): Promise<PfxKey[]> {
    const res = await this.invoke<{ certificates?: PfxEntry[] }>('pfx', 'list_all_certificates', [], signal);
    const now = new Date();
    const keys: PfxKey[] = [];
    for (const el of res.certificates ?? []) {
      const info = parseCertificateInfo(el.alias, now);
      if (info) keys.push({ ...info, type: 'pfx', disk: el.disk, path: el.path, name: el.name, alias: el.alias });
    }
    return keys;
  }

  private async listTokens(signal?: AbortSignal): Promise<TokenKey[]> {
    const res = await this.invoke<{ tokens?: TokenEntry[] }>('ftjc', 'list_all_keys', [''], signal);
    const now = new Date();
    const keys: TokenKey[] = [];
    for (const el of res.tokens ?? []) {
      const info = parseCertificateInfo(el.info, now);
      if (info) {
        keys.push({
          ...info,
          type: 'ftjc',
          cardUID: el.cardUID,
          statusInfo: el.statusInfo,
          ownerName: el.ownerName,
          info: el.info,
        });
      }
    }
    return keys;
  }

  /** Какие аппаратные носители подключены. Носители, которые версия E-IMZO не поддерживает, — `false`. */
  listDevices(options: EimzoCallOptions = {}): Promise<Record<DeviceType, boolean>> {
    const { signal } = options;
    return this.guard(async () => {
      const v = await this.whenReady(signal);
      const check = async (enabled: boolean, plugin: string, name: string, field: string) => {
        if (!enabled) return false;
        try {
          const res = await this.invoke(plugin, name, [], signal);
          return Array.isArray(res[field]) && res[field].length > 0;
        } catch (error) {
          // Ошибка плагина = носителя нет; ошибки связи пробрасываем.
          if (error instanceof EimzoError && error.code === 'EIMZO_ERROR') return false;
          throw error;
        }
      };
      const [idcard, baikey, ckc] = await Promise.all([
        check(atLeast(v, VERSION_PFX_ONLY), 'idcard', 'list_readers', 'readers'),
        check(atLeast(v, VERSION_BAIK_CKC), 'baikey', 'list_tokens', 'tokens'),
        check(atLeast(v, VERSION_BAIK_CKC), 'ckc', 'list_ckc', 'devices'),
      ]);
      return { idcard, baikey, ckc };
    });
  }

  /**
   * Загружает ключ и запоминает его `keyId` для `sign()`.
   * Для аппаратного носителя (`'idcard' | 'baikey' | 'ckc'`) E-IMZO не вызывается.
   * Каждый вызов для PFX создаёт новую сессию, и E-IMZO снова спросит пароль.
   * Предыдущий загруженный PFX-ключ выгружается из E-IMZO.
   * При ошибке проверки пароля PFX выгружается; если очистка не удалась,
   * возвращается её ошибка, а `keyId` сохраняется для повторного `unloadKey()`.
   */
  loadKey(key: EimzoKey | DeviceType, options: LoadKeyOptions = {}): Promise<string> {
    return this.exclusive(() => this.doLoadKey(key, options), options.signal);
  }

  private async doLoadKey(key: EimzoKey | DeviceType, options: LoadKeyOptions): Promise<string> {
    const { signal } = options;
    await this.releaseCurrentKey();
    throwIfAborted(signal);
    let keyId: unknown;
    if (typeof key === 'string') {
      keyId = key;
    } else if (key.type === 'pfx') {
      keyId = (await this.invoke<{ keyId?: unknown }>('pfx', 'load_key', [key.disk, key.path, key.name, key.alias])).keyId;
    } else {
      keyId = (await this.invoke<{ keyId?: unknown }>('ftjc', 'load_key', [key.cardUID])).keyId;
    }
    if (typeof keyId !== 'string' || !keyId) {
      throw new EimzoError('EIMZO_ERROR', { reason: 'invalid keyId in response' });
    }
    this.currentKey = key;
    this.currentKeyId = keyId;
    try {
      if (options.verifyPassword && typeof key !== 'string') {
        throwIfAborted(signal);
        if (key.type === 'pfx') await this.invoke('pfx', 'verify_password', [keyId]);
        else await this.invoke('ftjc', 'verify_pin', [keyId, '1']);
      }
      // Вызывающий уже получил отказ: ключ, загруженный после отмены, выгружаем.
      throwIfAborted(signal);
    } catch (error) {
      // load_key уже создал сессию; при сбое очистки сохраняем её для повторной выгрузки.
      await this.releaseCurrentKey();
      throw error;
    }
    return keyId;
  }

  /**
   * Выгрузить ключ из E-IMZO и забыть его. Вызывайте при выходе пользователя:
   * иначе пароль, запомненный на 6 часов, останется в E-IMZO на этом компьютере.
   * При сбое выгрузки `keyId` сохраняется, чтобы можно было повторить вызов.
   */
  unloadKey(): Promise<void> {
    return this.exclusive(() => this.releaseCurrentKey());
  }

  private async releaseCurrentKey(): Promise<void> {
    const key = this.currentKey;
    const keyId = this.currentKeyId;
    if (keyId && key && typeof key !== 'string' && key.type === 'pfx') {
      try {
        await this.invoke('pfx', 'unload_key', [keyId]);
      } catch (error) {
        // Уже выгружен или E-IMZO перезапущен — цель достигнута.
        if (!isEimzoError(error, 'KEY_NOT_FOUND')) throw error;
      }
    }
    this.currentKey = null;
    this.currentKeyId = null;
  }

  /** Создаёт PKCS#7 (base64). Пароль спрашивает окно E-IMZO, сайт его не видит. */
  sign(data: SignableData, options: SignOptions = {}): Promise<string> {
    return this.exclusive(() => this.doSign(data, options), options.signal);
  }

  /**
   * Подписывает файл (`File` из `<input type="file">` или `Blob`). По умолчанию detached.
   * Метку времени добавьте отдельно: `signDocument(await file.arrayBuffer(), { detached: true })`.
   */
  signFile(file: Blob, options: SignFileOptions = {}): Promise<string> {
    return this.exclusive(async () => {
      const max = options.maxSize ?? DEFAULT_MAX_FILE_SIZE;
      if (file.size > max) throw new EimzoError('FILE_TOO_LARGE', { size: file.size, max });
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.doSign(bytes, { detached: options.detached ?? true, keyId: options.keyId, signal: options.signal });
    }, options.signal);
  }

  private async doSign(data: SignableData, options: SignOptions): Promise<string> {
    const keyId = options.keyId ?? this.currentKeyId;
    if (!keyId) throw new EimzoError('KEY_NOT_LOADED');
    const data64 = toBase64(data, options.base64 === true);
    const create = async (id: string): Promise<string> => {
      throwIfAborted(options.signal);
      const res = await this.invoke<{ pkcs7_64?: unknown }>('pkcs7', 'create_pkcs7', [data64, id, options.detached ? 'yes' : 'no']);
      if (typeof res.pkcs7_64 !== 'string' || !res.pkcs7_64) {
        throw new EimzoError('EIMZO_ERROR', { reason: 'invalid pkcs7_64 in response' });
      }
      return res.pkcs7_64;
    };
    try {
      return await create(keyId);
    } catch (error) {
      // E-IMZO забыл keyId (24 часа или перезапуск): загружаем тот же ключ и пробуем ещё раз.
      const key = this.currentKey;
      const canReload =
        this.options.autoReloadKey !== false &&
        options.keyId === undefined &&
        isEimzoError(error, 'KEY_NOT_FOUND') &&
        key !== null &&
        typeof key !== 'string';
      if (!canReload) throw error;
      this.currentKeyId = null; // старый keyId уже недействителен, выгружать нечего
      return create(await this.doLoadKey(key, { signal: options.signal }));
    }
  }

  /**
   * Вход по ЭЦП: challenge с backend → `loadKey` → подпись challenge → `backend.login`.
   * Возвращает то, что вернул `backend.login` (сессия, JWT и т.п.).
   */
  login(key: EimzoKey | DeviceType, options: EimzoCallOptions = {}): Promise<TLogin> {
    const { signal } = options;
    return this.exclusive(async () => {
      const backend = this.requireBackend('getChallenge', 'login');
      const challenge = await backend.getChallenge!({ signal });
      await this.doLoadKey(key, { signal });
      const pkcs7 = await this.doSign(challenge, { signal });
      throwIfAborted(signal);
      return backend.login!(pkcs7, { signal });
    }, signal);
  }

  /** Подпись документа загруженным ключом + метка времени через backend. */
  signDocument(data: SignableData, options: SignOptions = {}): Promise<string> {
    return this.exclusive(async () => {
      const backend = this.requireBackend('timestamp');
      const pkcs7 = await this.doSign(data, options);
      throwIfAborted(options.signal);
      return backend.timestamp!(pkcs7, { signal: options.signal });
    }, options.signal);
  }

  private requireBackend(...methods: (keyof EimzoBackend)[]): EimzoBackend<TLogin> {
    const backend = this.options.backend;
    const missing = methods.filter((m) => typeof backend?.[m] !== 'function');
    if (!backend || missing.length > 0) {
      throw new EimzoError('BACKEND_NOT_CONFIGURED', { methods: missing.join(', ') });
    }
    return backend;
  }
}

export function createEimzo<TLogin = unknown>(options: EimzoOptions<TLogin> = {}): Eimzo<TLogin> {
  return new Eimzo<TLogin>(options);
}
