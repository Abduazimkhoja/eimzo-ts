# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
До 1.0.0 минорная версия может менять API.

## [Unreleased]

### Добавлено

- Отмена через `AbortSignal`: `{ signal }` принимают `init`, `getVersion`, `listKeys`, `listDevices`,
  `loadKey`, `sign`, `signFile`, `login`, `signDocument`, `call`, транспорты и методы `EimzoBackend`.
  Отменённый вызов отклоняется с `signal.reason`. Операция в очереди подписи не запускается; у запущенной
  вызов E-IMZO не обрывается, и очередь ждёт его, чтобы не открыть второе окно пароля.
  Ключ, загруженный уже после отмены `loadKey()`, выгружается.
- Тип `EimzoCallOptions`; экспорт `eimzo-ts/package.json`.
- `CONTRIBUTING.md`, `SECURITY.md`; проверки ESLint, покрытия, `publint` и `attw` в CI (`npm run check`).

### Изменено

- `Transport` и методы `EimzoBackend` получают необязательный второй параметр `{ signal }`.
  Существующие реализации продолжают работать.
- Разработка и CI — на Node.js 22 и 24 (Node.js 20 больше не поддерживается). Требования к среде
  выполнения библиотеки не менялись.

### Исправлено

- `createFetchBackend()`: поле `status` проверяется только в ответах challenge и timestamp (формат
  e-imzo-server). Ответ `login` с собственным полем `status` (например, `"ok"`) больше не считается ошибкой.
- `createFetchBackend()`: ответ `204 No Content` на `login` возвращается как `null`; сбой сети даёт
  `BACKEND_ERROR` с исходной ошибкой в `cause` вместо `TypeError`.
- Тексты из `messages.ru` используются как запасные для своего языка (раньше — только встроенный русский).
- Версии E-IMZO сравниваются по частям: `4.100` больше не считается равной `5.0`.
- При сбое `unloadKey()` идентификатор PFX сохраняется для повторной выгрузки.
- Ошибка или отмена `verifyPassword` освобождает загруженный PFX; ошибка очистки
  возвращается вызывающему коду, а ключ остаётся доступным для повторной выгрузки.
- `loadKey()` и `sign()` отклоняют ответы без непустых строк `keyId` и `pkcs7_64`.
- `createFetchBackend()` объединяет заголовки без учёта регистра и отклоняет
  не-JSON и пустые ответы `200`, сохраняя HTTP-статус в ошибке.
- `timeoutMs` применяется и к расширению EIMZOEXT; таймер очищается после завершения вызова.
- Ошибки сериализации и отправки WebSocket отклоняют Promise и закрывают соединение.

## [0.1.3]

### Документация

- README на английском (русский — `README.ru.md`), сайт документации с примерами, FAQ и разбором ошибок.
- `llms.txt`, `llms-full.txt`, `AGENTS.md`, Agent Skill `skills/eimzo-ts/` (входит в npm-пакет), `AI_INTEGRATION.md`.

## [0.1.2]

### Исправлено

- Неверный пароль в E-IMZO 6.3 (`status -9999`, «Sequence tag error» / «Password is not ASCII»)
  теперь даёт `WRONG_PASSWORD`, а не `EIMZO_ERROR`.

## [0.1.1]

### Исправлено

- «Отмена» в окне пароля E-IMZO (`status -5000`) теперь даёт `CANCELLED`, а не `EIMZO_ERROR`.

## [0.1.0]

Первая версия.

### Добавлено

- `createEimzo()` / `Eimzo`: `init`, `getVersion`, `listKeys`, `listDevices`, `loadKey`, `unloadKey`,
  `sign`, `signFile`, `login`, `signDocument`, `call`.
- Ключи PFX, ID-карта, BAIK-токен, CKC; токены `ftjc` для E-IMZO старше 4.12.
- `createFetchBackend()` — challenge, вход и метка времени через ваш backend в формате e-imzo-server.
- `EimzoError` с кодами ошибок, сообщения на русском, узбекском (латиница и кириллица),
  каракалпакском и английском; свои тексты через `messages`.
- Повторная загрузка ключа, если E-IMZO забыл `keyId` (`autoReloadKey`).
- Очередь: операции с окном пароля выполняются по одной.
- Сборки ESM, CJS и IIFE (`EimzoClient`) с типами.
- Демо с режимом без E-IMZO и просмотром содержимого PKCS#7.

[Unreleased]: https://github.com/abduazimkhuja/eimzo-ts/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/abduazimkhuja/eimzo-ts/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/abduazimkhuja/eimzo-ts/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/abduazimkhuja/eimzo-ts/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/abduazimkhuja/eimzo-ts/releases/tag/v0.1.0
