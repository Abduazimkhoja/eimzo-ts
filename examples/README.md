# Примеры для фреймворков

Каждый пример — отдельный проект с `eimzo-ts` из npm: выбор ключа, загрузка, подпись, выгрузка ключа,
ошибки по `error.code`. По умолчанию работают **без E-IMZO** на вымышленных ключах (mock); на localhost
открывается настоящий E-IMZO, переключатель — `?mode=real|mock` в адресе.

| Пример | Стек | Открыть без установки |
| --- | --- | --- |
| [vanilla-ts](vanilla-ts) | Vite + TypeScript | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/vanilla-ts) |
| [react](react) | Vite + React 19, хук `useEimzo` | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/react) |
| [nextjs](nextjs) | Next.js 15, App Router, `'use client'` | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/nextjs) |
| [vue](vue) | Vite + Vue 3, composable `useEimzo` | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/vue) |
| [nuxt](nuxt) | Nuxt 4, `<ClientOnly>` | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/nuxt) |
| [angular](angular) | Angular 20, сервис на сигналах, `afterNextRender` | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/angular) |
| [svelte](svelte) | SvelteKit, Svelte 5, `onMount` | [StackBlitz](https://stackblitz.com/github/abduazimkhuja/eimzo-ts/tree/main/examples/svelte) |

Ссылки StackBlitz работают, когда папка есть в ветке `main` на GitHub.

## Запуск локально

```bash
cd examples/react
npm install
npm run dev
```

## Правила, которые показывают примеры

- Один экземпляр `Eimzo` на приложение (`eimzo.ts`), иначе E-IMZO спрашивает пароль при каждой подписи.
- К E-IMZO обращаются только из браузера: `useEffect`, `onMounted`, `onMount`, `afterNextRender`, `<ClientOnly>`.
  Вызов метода на сервере (SSR) даёт ошибку `NOT_IN_BROWSER`; создавать экземпляр `createEimzo()` на уровне модуля можно.
- Ветвление по `error.code`, текст — `eimzo.t(error)`; `CANCELLED` пользователю не показывается.
- Просроченные ключи (`key.expired`) отключены в списке; при выходе вызывается `unloadKey()`.

## Общий код

`eimzo.ts` и `mock-transport.ts` живут в [`_shared/`](_shared) и копируются в каждый пример
(StackBlitz открывает одну подпапку). После правки в `_shared/` запустите `npm run examples:sync` в корне
репозитория; `npm run check` падает, если копии разошлись.
