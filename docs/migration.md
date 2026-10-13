# Переход с e-imzo.js / e-imzo-client.js

Официальный пример подключает три файла: `e-imzo.js` (`CAPIWS`), `e-imzo-client.js` (`EIMZOClient`)
и `e-imzo-init.js`. eimzo-ts заменяет все три.

```diff
- <script src="e-imzo.js"></script>
- <script src="e-imzo-client.js"></script>
- <script src="e-imzo-init.js"></script>
+ import { createEimzo, DEV_API_KEYS } from 'eimzo-ts';
+ const eimzo = createEimzo({ apiKeys: { ...DEV_API_KEYS, 'example.uz': '...' } });
```

## Соответствие функций

| Официальный пример | eimzo-ts |
|---|---|
| `EIMZOClient.API_KEYS = [...]` | `createEimzo({ apiKeys })` |
| `checkVersion(success, fail)` + `installApiKeys(success, fail)` | `await eimzo.init()` (вызывается сам) |
| `listAllUserKeys(itemIdGen, itemUiGen, success, fail)` | `await eimzo.listKeys()` |
| `idCardIsPLuggedIn`, `isBAIKTokenPLuggedIn`, `isCKCPLuggedIn` | `await eimzo.listDevices()` → `{ idcard, baikey, ckc }` |
| `loadKey(item, success, fail, verifyPassword)` | `await eimzo.loadKey(key, { verifyPassword })` |
| `createPkcs7(id, data, timestamper, success, fail, detached, isBase64)` | `await eimzo.sign(data, { detached, base64 })` |
| `createPkcs7(..., timestamper, ...)` с меткой времени | `await eimzo.signDocument(data)` + `backend.timestamp` |
| `changeKeyPassword(item, success, fail)` | `await eimzo.call('pfx', 'change_password', [eimzo.keyId])` |
| `CAPIWS.callFunction({ plugin, name, arguments }, ...)` | `await eimzo.call(plugin, name, args)` |
| `wsError(e)` / `uiShowMessage` | `catch (e) { eimzo.t(e) }`, `e.code` |
| ID-карта: `createPkcs7('idcard', ...)` | `await eimzo.loadKey('idcard')`, затем `sign()` |

## Пример: вход

Было (`e-imzo-init.js` + `index.php`):

```js
EIMZOClient.loadKey(item, function (id) {
  getChallenge(function (challenge) {
    EIMZOClient.createPkcs7(id, challenge, null, function (pkcs7) {
      document.testform.keyId.value = id;
      document.testform.pkcs7.value = pkcs7;
      document.testform.submit();
    }, uiHandleError);
  });
}, uiHandleError);
```

Стало:

```ts
const keys = await eimzo.listKeys();
try {
  const user = await eimzo.login(keys[selected]);
} catch (e) {
  if (!isEimzoError(e, 'CANCELLED')) alert(eimzo.t(e));
}
```

## Отличия

- **Объекты ключей.** Вместо `itemIdGen`/`itemUiGen` и `vo` — массив `EimzoKey` с полями `CN`,
  `TIN`, `PINFL`, `O`, `T`, `validFrom`, `validTo` (`Date`), `expired`. Ключи без ИНН и ПИНФЛ
  пропускаются, как в оригинале.
- **Ошибки.** Вместо `fail(e, reason)` — `EimzoError` с `code`; `reason` и `status` от E-IMZO
  сохранены. Неверный пароль — `WRONG_PASSWORD` вместо поиска `BadPaddingException` в тексте.
- **Глобальные изменения.** `String.prototype.splitKeep` и `Date.prototype` не трогаются.
- **keyId.** Хранится в экземпляре (`eimzo.keyId`). Если E-IMZO его забыл, ключ загружается
  заново автоматически (`autoReloadKey`).
- **Выход.** `unloadKey()` выгружает ключ из E-IMZO, и запомненный на 6 часов пароль стирается.
- **Очередь.** Одновременные вызовы `sign()` не открывают несколько окон пароля.
- **Расширение `EIMZOEXT`** используется автоматически, если оно есть на странице.
