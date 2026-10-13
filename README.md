# eimzo-client

TypeScript-клиент для [E-IMZO](https://e-imzo.uz) без зависимостей и без привязки к фреймворку.
Заменяет `e-imzo.js` + `e-imzo-client.js` из официального примера: те же вызовы E-IMZO,
но на Promise, с типами и без глобальных переменных и правок `String.prototype`/`Date.prototype`.

Работает в Angular, React, Vue, Svelte и на обычной странице. Только для ПК: подпись выполняет
приложение E-IMZO, установленное на компьютере пользователя.

## Установка

```bash
npm install eimzo-client
```

Без сборщика: `<script src="dist/index.global.js"></script>` → глобальный объект `EimzoClient`.

## Быстрый старт

```ts
import { createEimzo, createFetchBackend, DEV_API_KEYS } from 'eimzo-client';

const eimzo = createEimzo({
  apiKeys: { ...DEV_API_KEYS, 'my-site.uz': 'API-KEY от НИЦ НТ' },
  backend: createFetchBackend({
    challengeUrl: '/api/eimzo/challenge',
    loginUrl: '/api/eimzo/login',
    timestampUrl: '/api/eimzo/timestamp',
    init: { credentials: 'include' },          // заголовки, CSRF и т.п.
  }),
});

const keys = await eimzo.listKeys();             // PFX-ключи пользователя
const session = await eimzo.login(keys[0]);      // challenge → пароль в E-IMZO → backend
const pkcs7 = await eimzo.signDocument('текст'); // подпись + метка времени
```

## API

| Метод | Что делает |
|---|---|
| `init()` | Проверяет версию E-IMZO и устанавливает API-ключи. Вызывается сам перед любой операцией. |
| `getVersion()` | Версия установленного E-IMZO. |
| `listKeys()` | Список ключей (`EimzoKey`): ФИО, ИНН, ПИНФЛ, организация, срок, `expired`. |
| `listDevices()` | Подключены ли ID-карта, BAIK-токен, CKC-устройство. |
| `loadKey(key \| 'idcard' \| 'baikey' \| 'ckc')` | Загружает ключ, запоминает `keyId`. |
| `sign(data, { detached, base64, keyId })` | PKCS#7 в base64. `data` — строка, `Uint8Array` или `ArrayBuffer`. |
| `login(key)` | Вход: `getChallenge` → `loadKey` → `sign(challenge)` → `backend.login`. |
| `signDocument(data, opts)` | `sign` → `backend.timestamp`. |
| `unloadKey()` | Забыть `keyId` (при выходе). |
| `call(plugin, name, args)` | Прямой вызов любой функции E-IMZO. |

### Ошибки

Все ошибки — `EimzoError` с полем `code`:

| `code` | Что показать пользователю |
|---|---|
| `NOT_INSTALLED` | E-IMZO не установлен или не запущен — ссылка на скачивание. |
| `OUTDATED_VERSION` | Нужно обновить E-IMZO. |
| `API_KEY_REJECTED` | Ошибка настройки сайта (API-KEY для домена). |
| `WRONG_PASSWORD` | Неверный пароль. |
| `KEY_NOT_LOADED` | Ошибка в коде: `sign()` до `loadKey()`. |
| `BACKEND_ERROR` | Ответ backend (`httpStatus`, `message`). |
| `EIMZO_ERROR` | Прочее; исходный текст в `reason`. |
| `TIMEOUT`, `WEBSOCKET_UNSUPPORTED` | Редкие случаи. |

### Пароль на 6 часов

E-IMZO запоминает пароль для конкретного `keyId`, если пользователь отметит «Запомнить на 6 час.».
Клиент хранит `keyId` после `loadKey()`, поэтому повторные `sign()` проходят без пароля.
Держите один экземпляр `Eimzo` на всё приложение. Перезагрузка страницы сбрасывает `keyId` —
перед подписью снова нужен `loadKey()`. Через 24 часа сессия `keyId` в E-IMZO истекает.

## Контракт с backend

Браузер не обращается к e-imzo-server напрямую. `createFetchBackend` ждёт ответы в формате
e-imzo-server, поэтому backend может просто проксировать запросы:

| Запрос клиента | Backend | Ответ |
|---|---|---|
| `GET challengeUrl` | → `GET /frontend/challenge` (без кеша) | `{ "status": 1, "challenge": "..." }` |
| `POST loginUrl`, тело — PKCS#7 | → `POST /backend/auth`, поиск пользователя по ПИНФЛ/ИНН, сессия | что угодно (вернётся из `login()`) |
| `POST timestampUrl`, тело — PKCS#7 | → `POST /frontend/timestamp/pkcs7` | `{ "status": 1, "pkcs7b64": "..." }` |

Если у вас другой формат, передайте свой объект вместо `createFetchBackend`:

```ts
createEimzo({
  backend: {
    getChallenge: () => api.get('/challenge').then((r) => r.data.value),
    login: (pkcs7) => api.post('/login', { pkcs7 }).then((r) => r.data),
    timestamp: (pkcs7) => api.post('/timestamp', { pkcs7 }).then((r) => r.data.pkcs7),
  },
});
```

## Подключение во фреймворках

Создайте **один** экземпляр на приложение.

**Angular**

```ts
@Injectable({ providedIn: 'root' })
export class EimzoService {
  readonly client = createEimzo({ apiKeys: environment.eimzoApiKeys, backend: createFetchBackend({ ... }) });
}

// в компоненте
keys = signal<EimzoKey[]>([]);
async ngOnInit() { this.keys.set(await this.eimzo.client.listKeys()); }
async login(key: EimzoKey) { await this.eimzo.client.login(key); this.router.navigate(['/cabinet']); }
```

Чтобы использовать `HttpClient` с интерсепторами, передайте свой `backend` через `firstValueFrom(this.http.get(...))`.

**React**

```tsx
export const eimzo = createEimzo({ ... });   // модуль-синглтон

function KeyPicker() {
  const [keys, setKeys] = useState<EimzoKey[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => { eimzo.listKeys().then(setKeys, (e) => setError(e.message)); }, []);
  // ...
}
```

**Vue**

```ts
export const eimzo = createEimzo({ ... });

const keys = ref<EimzoKey[]>([]);
onMounted(async () => { keys.value = await eimzo.listKeys(); });
```

## API-ключи

- `localhost` и `127.0.0.1` — `DEV_API_KEYS` (публичные ключи из примера E-IMZO).
- Тестовый домен или IP — «Режим разработчика» в меню E-IMZO в трее.
- Production-домен — API-KEY выдаёт НИЦ НТ, отдельный на каждый домен и поддомен.
- E-IMZO v6 может подобрать ключ по домену сам; тогда `apiKeys` можно не передавать.

## Разработка

```bash
npm install
npm test           # vitest
npm run typecheck
npm run build      # dist/: ESM, CJS, IIFE + .d.ts
npm run demo       # http://localhost:3000/demo/ — проверка с настоящим E-IMZO
```

В демо есть кнопка «Посмотреть содержимое» (`demo/pkcs7-viewer.js`): показывает документ, подписанта
и время подписи из любого PKCS#7. Подпись при этом не проверяется — только чтение структуры.
