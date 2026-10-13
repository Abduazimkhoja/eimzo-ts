# eimzo-ts

[![npm](https://img.shields.io/npm/v/eimzo-ts)](https://www.npmjs.com/package/eimzo-ts)
[![CI](https://github.com/abduazimkhuja/eimzo-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/abduazimkhuja/eimzo-ts/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/eimzo-ts)](LICENSE)

[English](README.md) · **Русский**

TypeScript-клиент для [E-IMZO](https://e-imzo.uz): список ключей ЭЦП, подпись PKCS#7, вход по ЭЦП.
Без зависимостей и без привязки к фреймворку: Angular, React, Vue, Svelte или обычная страница.

Заменяет `e-imzo.js` и `e-imzo-client.js` из официального примера. Вызовы E-IMZO те же, но
на Promise, с типами, без глобальных переменных и без правок `String.prototype`/`Date.prototype`.

> **Неофициальная библиотека.** Не связана с разработчиками E-IMZO.

**[Документация](https://abduazimkhuja.github.io/eimzo-ts/ru/)** · **[Демо](https://abduazimkhuja.github.io/eimzo-ts/demo/)** работает и без E-IMZO, на вымышленных ключах.

Только для ПК: подпись выполняет приложение E-IMZO на компьютере пользователя. Мобильный
вход (ID-CARD E-IMZO MOBILE) пока не поддерживается.

## Установка

```bash
npm install eimzo-ts
```

Без сборщика:

```html
<script src="https://unpkg.com/eimzo-ts@0.1/dist/index.global.js"></script>
<script>
  const eimzo = EimzoClient.createEimzo({ apiKeys: EimzoClient.DEV_API_KEYS });
</script>
```

## Быстрый старт

```ts
import { createEimzo, createFetchBackend, DEV_API_KEYS } from 'eimzo-ts';

const eimzo = createEimzo({
  apiKeys: { ...DEV_API_KEYS, 'my-site.uz': 'API-KEY от НИЦ НТ' },
  backend: createFetchBackend({
    challengeUrl: '/api/eimzo/challenge',
    loginUrl: '/api/eimzo/login',
    timestampUrl: '/api/eimzo/timestamp',
    init: { credentials: 'include' }, // заголовки, CSRF и т.п.
  }),
});

const keys = await eimzo.listKeys();                // ключи пользователя
const user = await eimzo.login(keys[0]);            // вход: пароль спросит окно E-IMZO
const pkcs7 = await eimzo.signDocument('документ'); // подпись + метка времени
```

Создавайте **один** экземпляр на всё приложение: он хранит `keyId` загруженного ключа.

## API

| Метод | Что делает |
|---|---|
| `init()` | Проверяет версию E-IMZO и устанавливает API-ключи. Вызывается сам перед любой операцией. |
| `getVersion()` | Версия установленного E-IMZO. |
| `listKeys()` | Ключи (`EimzoKey`): `CN`, `TIN`, `PINFL`, `O`, `T`, `validFrom`, `validTo`, `expired`. |
| `listDevices()` | Подключены ли ID-карта, BAIK-токен, CKC: `{ idcard, baikey, ckc }`. |
| `loadKey(key \| 'idcard' \| 'baikey' \| 'ckc')` | Загружает ключ, запоминает `keyId`. Предыдущий ключ выгружается. |
| `sign(data, { detached, base64, keyId })` | PKCS#7 в base64. `data` — строка, `Uint8Array` или `ArrayBuffer`. |
| `signFile(file, { detached, maxSize })` | Подпись `File`/`Blob`. По умолчанию detached, не больше 10 МБ. |
| `login(key)` | Вход: challenge → `loadKey` → подпись → `backend.login`. |
| `signDocument(data, options)` | `sign` → `backend.timestamp`. |
| `unloadKey()` | Выгружает ключ из E-IMZO. Вызывайте при выходе пользователя. |
| `call(plugin, name, args)` | Любая функция E-IMZO, см. `http://127.0.0.1:64646/apidoc.html`. |
| `setLocale(locale)`, `t(error)` | Язык сообщений об ошибках. |

Все методы, которые ждут E-IMZO или backend, кроме `unloadKey`, принимают `{ signal }`, см. [Отмена](#отмена).

### Опции `createEimzo`

| Опция | По умолчанию | |
|---|---|---|
| `apiKeys` | — | `{ домен: ключ }` или `[домен, ключ, ...]`. Для localhost — `DEV_API_KEYS`. |
| `backend` | — | `createFetchBackend(...)` или свой объект, см. ниже. |
| `minVersion` | `'4.86'` | Ниже — ошибка `OUTDATED_VERSION`. |
| `locale` | `'ru'` | `'ru'`, `'uz-Latn'`, `'uz-Cyrl'`, `'kaa'`, `'en'` или свой код. |
| `messages` | — | Свои тексты ошибок. Недостающие берутся из `messages.ru`, затем из встроенного русского. |
| `autoReloadKey` | `true` | Если E-IMZO забыл `keyId`, загрузить ключ заново и повторить подпись. |
| `timeoutMs` | без ограничения | Таймаут каждого вызова E-IMZO. Для одной операции — `signal: AbortSignal.timeout(ms)`. |
| `url`, `WebSocketImpl`, `transport` | | Для тестов и нестандартного окружения. |

## Ошибки

Все ошибки — `EimzoError`. Для логики используйте `code`, для показа — `message`
(уже на языке `locale`) или `eimzo.t(error)`.

```ts
import { isEimzoError } from 'eimzo-ts';

try {
  await eimzo.login(key);
} catch (e) {
  if (isEimzoError(e, 'CANCELLED')) return;       // пользователь закрыл окно
  if (isEimzoError(e, 'NOT_INSTALLED')) showDownloadLink();
  else showError(eimzo.t(e));
}
```

| `code` | Когда |
|---|---|
| `NOT_INSTALLED` | E-IMZO не установлен или не запущен. |
| `OUTDATED_VERSION` | Версия ниже `minVersion`; в `params` — `installed` и `min`. |
| `API_KEY_REJECTED` | Нет API-KEY для домена страницы. |
| `WRONG_PASSWORD` | Неверный пароль ключа. |
| `CANCELLED` | Пользователь закрыл окно пароля. |
| `KEY_NOT_FOUND` | E-IMZO не знает `keyId` (прошло 24 часа, перезапуск E-IMZO). |
| `KEY_NOT_LOADED` | `sign()` до `loadKey()` — ошибка в коде. |
| `FILE_TOO_LARGE` | Файл больше `maxSize`. |
| `BACKEND_NOT_CONFIGURED` | Нет нужного метода в `backend` — ошибка в коде. |
| `BACKEND_ERROR` | Backend ответил ошибкой; `httpStatus`, `params.detail`. |
| `EIMZO_ERROR` | Прочие ошибки E-IMZO; исходный текст в `reason`, код в `status`. |
| `TIMEOUT`, `WEBSOCKET_UNSUPPORTED` | Редкие случаи. |

### Языки

```ts
const eimzo = createEimzo({
  locale: 'uz-Latn',
  messages: {
    'uz-Latn': { WRONG_PASSWORD: () => 'Parol xato, qayta urinib ko‘ring.' }, // заменить один текст
    tg: { NOT_INSTALLED: () => '...' },                                        // добавить язык
  },
});
eimzo.setLocale('en');
```

Недостающие тексты берутся из `messages.ru`, затем из встроенного русского. Без экземпляра: `formatEimzoError(error, 'en')`.

## Отмена

Методы принимают `AbortSignal`, как `fetch`: при размонтировании компонента, уходе со страницы или для
ограничения времени одной операции.

```ts
const controller = new AbortController();
const keys = await eimzo.listKeys({ signal: controller.signal });
await eimzo.sign(data, { signal: AbortSignal.timeout(60_000) });
controller.abort(); // ожидающий вызов отклонится с signal.reason (по умолчанию AbortError)
```

Отменённый вызов отклоняется с `signal.reason`, а не с `EimzoError`: проверяйте `e.name === 'AbortError'`.
Операция, ещё стоящая в очереди подписи или ждущая `init()`, до E-IMZO не доходит. Окно пароля, которое E-IMZO уже открыл, остаётся
открытым — закрыть его извне нельзя, и следующая операция в очереди дождётся его. Уже отправленные запросы
не обрываются: если `loadKey()` отменили после выгрузки прежнего ключа, тот остаётся выгруженным.

## Пароль

- Пароль вводится в окне E-IMZO; сайт его не видит.
- Без флажка «Запомнить на 6 час.» E-IMZO помнит пароль 1 минуту, с флажком — 6 часов.
  Запоминается для `keyId`, поэтому держите один экземпляр `Eimzo`.
- После перезагрузки страницы `keyId` теряется — снова нужен `loadKey()`.
- `unloadKey()` при выходе из аккаунта стирает запомненный пароль на этом компьютере.
- Несколько вызовов `sign()` подряд (двойной клик) выполняются по очереди, а не открывают два окна.

## Backend

Браузер не обращается к e-imzo-server напрямую. `createFetchBackend` ждёт ответы в формате
e-imzo-server, поэтому backend может проксировать запросы:

| Запрос клиента | Backend | Ответ |
|---|---|---|
| `GET challengeUrl` | `GET /frontend/challenge`, без кеша | `{ "status": 1, "challenge": "..." }` |
| `POST loginUrl`, тело — PKCS#7 | `POST /backend/auth`, поиск пользователя по ПИНФЛ/ИНН, сессия | любой JSON — вернётся из `login()` как есть; `204 No Content` — `null` |
| `POST timestampUrl`, тело — PKCS#7 | `POST /frontend/timestamp/pkcs7` | `{ "status": 1, "pkcs7b64": "..." }` |

Подробно, с примером на Java (Spring Boot): [docs/backend.md](docs/backend.md).

Другой формат — свой объект вместо `createFetchBackend`:

```ts
createEimzo({
  backend: {
    getChallenge: () => api.get('/challenge').then((r) => r.data.value),
    login: (pkcs7) => api.post('/login', { pkcs7 }).then((r) => r.data),
    timestamp: (pkcs7) => api.post('/timestamp', { pkcs7 }).then((r) => r.data.pkcs7),
  },
});
```

## Фреймворки

**Angular**

```ts
@Injectable({ providedIn: 'root' })
export class EimzoService {
  readonly client = createEimzo({ apiKeys: environment.eimzoApiKeys, backend: createFetchBackend({ /* ... */ }) });
}

// компонент
keys = signal<EimzoKey[]>([]);
async ngOnInit() { this.keys.set(await this.eimzo.client.listKeys()); }
async login(key: EimzoKey) { await this.eimzo.client.login(key); this.router.navigate(['/cabinet']); }
```

Для `HttpClient` с интерсепторами передайте свой `backend` через `firstValueFrom(this.http.get(...))`.

**React**

```tsx
export const eimzo = createEimzo({ /* ... */ }); // модуль-синглтон

function KeyPicker() {
  const [keys, setKeys] = useState<EimzoKey[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => { eimzo.listKeys().then(setKeys, (e) => setError(eimzo.t(e))); }, []);
  // ...
}
```

**Vue**

```ts
export const eimzo = createEimzo({ /* ... */ });

const keys = ref<EimzoKey[]>([]);
onMounted(async () => { keys.value = await eimzo.listKeys(); });
```

## API-ключи

- `localhost` и `127.0.0.1` — `DEV_API_KEYS` (публичные ключи из официального примера).
- Другой домен или IP при разработке — «Режим разработчика» в меню E-IMZO в трее.
- Production — API-KEY выдаёт НИЦ НТ, отдельно на каждый домен и поддомен.

## Переход с e-imzo.js

Соответствие функций `EIMZOClient` и этой библиотеки: [docs/migration.md](docs/migration.md).

## Разработка

```bash
npm install
npm run check          # всё, что запускает CI: линтер, типы, тесты с покрытием, сборка, проверка пакета
npm test               # vitest
npm run lint           # ESLint с проверками по типам
npm run typecheck      # tsc, включая тесты типов публичного API
npm run build          # dist/: ESM, CJS, IIFE + .d.ts
npm run demo           # http://localhost:3000/demo/
npm run check:eimzo    # проверка на установленном E-IMZO; --interactive N — с подписью ключом N
```

## Участие в разработке

Ошибки и pull request'ы — по правилам в [CONTRIBUTING.md](CONTRIBUTING.md). Об уязвимостях сообщайте
приватно, см. [SECURITY.md](SECURITY.md).

## Лицензия

[MIT](LICENSE)
