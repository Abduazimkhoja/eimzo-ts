import { EimzoError, type EimzoErrorCode, type EimzoMessages } from './errors';
import { en } from './locales/en';
import { kaa } from './locales/kaa';
import { ru } from './locales/ru';
import { uzLatn } from './locales/uz-Latn';
import { uzCyrl } from './locales/uz-Cyrl';

/** Встроенные языки. Можно передать и любой свой код языка вместе с `messages`. */
export type BuiltinLocale = 'ru' | 'uz-Latn' | 'uz-Cyrl' | 'kaa' | 'en';
export type EimzoLocale = BuiltinLocale | (string & {});

export const DEFAULT_LOCALE: BuiltinLocale = 'ru';

export const builtinMessages: Record<BuiltinLocale, EimzoMessages> = {
  ru,
  'uz-Latn': uzLatn,
  'uz-Cyrl': uzCyrl,
  kaa,
  en,
};

/** Свои тексты: новый язык целиком или замена отдельных сообщений встроенного. */
export type MessageOverrides = Record<string, Partial<EimzoMessages>>;

/**
 * Текст ошибки на нужном языке. Порядок поиска: `overrides[locale]` → встроенный `locale`
 * → русский. Для не-`EimzoError` возвращает `error.message`.
 */
export function formatEimzoError(
  error: unknown,
  locale: EimzoLocale = DEFAULT_LOCALE,
  overrides: MessageOverrides = {},
): string {
  if (!(error instanceof EimzoError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const code = error.code as EimzoErrorCode;
  const format = (overrides[locale]?.[code] ??
    builtinMessages[locale as BuiltinLocale]?.[code] ??
    ru[code]) as (params: unknown) => string;
  return format(error.params);
}
