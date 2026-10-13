# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
До 1.0.0 минорная версия может менять API.

## [Unreleased]

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

[Unreleased]: https://github.com/abduazimkhuja/eimzo-ts/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/abduazimkhuja/eimzo-ts/releases/tag/v0.1.0
