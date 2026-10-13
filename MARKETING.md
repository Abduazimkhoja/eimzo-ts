# Продвижение eimzo-ts

Рабочий документ. Ничего отсюда не публикуется автоматически.

## Позиционирование

**Одной фразой:** типизированная замена официальных `e-imzo.js` / `e-imzo-client.js` для подписи и входа через
E-IMZO в браузере.

**Для кого:** frontend- и fullstack-разработчики в Узбекистане, которые подключают ЭЦП (E-IMZO) к
госуслугам, ЭДО, банкам, B2B-кабинетам — на Angular, React, Vue или без фреймворка.

**Чем отличается (только проверяемое):**

- Promise API и TypeScript-типы вместо callback'ов и глобальных переменных.
- Коды ошибок (`CANCELLED`, `WRONG_PASSWORD`, `NOT_INSTALLED`, …), проверенные на E-IMZO 6.3.5.
- Сообщения на ru / uz-Latn / uz-Cyrl / kaa / en.
- Очередь подписей, повторная загрузка «забытого» ключа, `unloadKey()` при выходе.
- Готовый контракт с backend в формате e-imzo-server и руководство для backend (Spring Boot).
- Без зависимостей; ESM, CJS, `<script>`.
- Демо, которое работает без E-IMZO.

**Честные ограничения:** только ПК, не проверяет подписи, нет UI-компонентов, нет мобильной подписи.
Конкурентов в npm много (около 20 пакетов по запросу «e-imzo»); сравнение функций с ними не проводилось.

## Поисковые запросы

| Категория | Примеры (en) | Примеры (ru / uz) |
|---|---|---|
| Интеграция | e-imzo integration, e-imzo javascript, e-imzo npm | подключение e-imzo, e-imzo на сайте, e-imzo integratsiya |
| Вход по ЭЦП | e-imzo login, eds login uzbekistan | вход по ЭЦП e-imzo, ERI orqali kirish |
| Подпись | e-imzo pkcs7 sign, e-imzo sign file | подпись pkcs7 e-imzo, подписать файл ЭЦП |
| Фреймворки | e-imzo angular, e-imzo react, e-imzo vue | e-imzo angular пример |
| Ошибки | e-imzo websocket error, e-imzo api key | e-imzo не подключается, ошибка api-key e-imzo |
| Миграция | e-imzo.js typescript, e-imzo-client.js promise | e-imzo.js на typescript |

## Площадки

- **npm** — уже опубликовано; описание и keywords обновлены.
- **GitHub** — description, topics, website (см. «Ручные действия» ниже).
- **Habr** (ru) — главная площадка для этой аудитории; статья «Подключаем E-IMZO на TypeScript».
- **Dev.to** (en) — та же статья на английском.
- **Telegram** — узбекские dev-группы (frontend, backend, Angular, React). Список групп:
  [awesome-telegram-dev-groups-uz](https://github.com/doniyor2109/awesome-telegram-dev-groups-uz).
  Соблюдайте правила каждой группы о самопродвижении.
- **LinkedIn** — короткий пост с демо.
- **Reddit** — r/typescript, r/javascript (правила о самопродвижении: публиковать как обмен опытом, не рекламу).
- **Hacker News (Show HN)** — тема узкая (одна страна); ожидания низкие, но ссылка с демо может зайти.
- **Floss Uzbekistan / локальные сообщества** — предложить доклад или пост.

## Черновик статьи для Dev.to

**Title:** Signing with E-IMZO from TypeScript: a typed replacement for e-imzo.js

**Tags:** typescript, javascript, webdev, opensource

> In Uzbekistan, many government and business services use E-IMZO for electronic digital signatures. E-IMZO is
> a desktop app; web pages talk to it over a local WebSocket. The official example (`e-imzo.js` +
> `e-imzo-client.js`) works, but it is callback-based, relies on globals and patches `String.prototype`.
>
> I wrote `eimzo-ts`, a small dependency-free TypeScript client that keeps the same E-IMZO calls but exposes
> them as a Promise API.
>
> **Listing keys and logging in**
>
> ```ts
> const eimzo = createEimzo({ apiKeys: DEV_API_KEYS, backend: createFetchBackend({ challengeUrl, loginUrl }) });
> const keys = await eimzo.listKeys();
> const user = await eimzo.login(keys[0]);
> ```
>
> **Errors you can branch on.** E-IMZO returns numeric statuses and Java exception texts. While testing against
> E-IMZO 6.3.5 I found that "Cancel" is status -5000 and a wrong password is status -9999 with
> "Sequence tag error" (or "Password is not ASCII" for a wrong keyboard layout). The library maps them to
> `CANCELLED` and `WRONG_PASSWORD`.
>
> **Things the official example leaves to you:** a queue so a double click does not open two password windows;
> reloading the key when E-IMZO forgets it after 24 hours; unloading the key on logout so the remembered password
> does not stay on a shared computer.
>
> **What it does not do:** verify signatures (that is e-imzo-server's job on your backend), mobile signing, UI.
>
> **Server side.** The browser never calls e-imzo-server directly… (кратко: challenge, /backend/auth, X-Real-IP и
> Host; подвох Java с заголовком Host).
>
> Demo (works without E-IMZO): https://abduazimkhuja.github.io/eimzo-ts/demo/ · npm: `eimzo-ts` ·
> GitHub: https://github.com/abduazimkhuja/eimzo-ts
>
> It is unofficial and young (0.1.x). Feedback and issues are welcome.

Для Habr — тот же план на русском, плюс раздел про backend из `docs/backend.md`.

## Черновик Show HN

**Title:** Show HN: eimzo-ts – TypeScript client for Uzbekistan's E-IMZO digital signature app

> E-IMZO is the desktop app that holds digital signature keys for many e-government and business services in
> Uzbekistan. Web pages reach it through a WebSocket on 127.0.0.1. The official JS example is callback-based and
> patches built-in prototypes, so I wrote a small typed client: list keys, create PKCS#7, challenge-based login,
> typed errors mapped from real E-IMZO responses, zero dependencies.
>
> The demo runs without E-IMZO using a mock that builds structurally valid CMS with a fake signature:
> https://abduazimkhuja.github.io/eimzo-ts/demo/
>
> Unofficial; signature verification stays on the server (e-imzo-server).

## Вариант для Reddit (r/typescript)

**Title:** Typed client for a national digital-signature desktop app (E-IMZO, Uzbekistan) — lessons from wrapping a local WebSocket API

> Short write-up of wrapping a callback/global-based vendor script into a typed Promise API: one WebSocket per call,
> mapping undocumented numeric statuses to error codes, a queue for modal password dialogs, and a mock transport for
> tests and a demo that runs without the desktop app. Code: https://github.com/abduazimkhuja/eimzo-ts —
> happy to hear how you would design the error types.

## Описание для GitHub Releases

Шаблон для следующих релизов (workflow создаёт релиз с автозаметками; текст можно дописать вручную):

```markdown
## eimzo-ts vX.Y.Z

<1–2 предложения: что изменилось для пользователя>

### Fixed / Added
- …

Install: `npm install eimzo-ts@X.Y.Z` · Docs: https://abduazimkhuja.github.io/eimzo-ts/ · Full changelog: CHANGELOG.md
```

Для v0.1.2 (можно вставить в уже созданный релиз):

> Wrong-password responses of E-IMZO 6.3 (status -9999, "Sequence tag error" / "Password is not ASCII") are now
> reported as `WRONG_PASSWORD`, and "Cancel" (status -5000) as `CANCELLED` (0.1.1). Both were verified against a
> real E-IMZO 6.3.5.

## Awesome-списки

Поиск не нашёл готового «awesome Uzbekistan» / «made in Uzbekistan» списка для open-source проектов. Варианты:

1. Перед подачей поискать на GitHub: `awesome uzbekistan`, `made in uzbekistan`, `awesome uz` — списки появляются.
2. Общие списки (awesome-typescript, awesome-javascript) обычно требуют популярности и широкой применимости;
   узконациональная библиотека туда вряд ли подойдёт. Не подавайте, пока нет звёзд и пользователей.
3. Если подходящего списка нет, можно создать свой «awesome-uzbekistan-dev» (E-IMZO, my.gov.uz API, платежи
   Click/Payme и т.п.). Это полезно сообществу само по себе, но требует поддержки.

## План на 30 дней

| Неделя | Действия |
|---|---|
| 1 | Заполнить GitHub description/topics/website. Подтвердить сайт в Google Search Console и Bing Webmaster Tools, отправить `sitemap.xml`. Проверить переводы uz/kaa у носителей. |
| 2 | Статья на Habr (ru). Посты в 2–3 тематических Telegram-группах с ссылкой на демо. |
| 3 | Статья на Dev.to (en), пост на LinkedIn. Ответить на вопросы, завести issues по отзывам. |
| 4 | Show HN или Reddit (одно, не всё сразу). Релиз с исправлениями по отзывам. Оценить: загрузки npm, звёзды, issues, переходы из Search Console. |

Метрики смотреть, но не накручивать: никаких покупных звёзд, отзывов и «ботов-загрузок».
