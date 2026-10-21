import { EimzoError, type EimzoErrorCode, type EimzoMessages } from './errors';
import { en, kaa, ru, uzCyrl, uzLatn } from './locales';
import { renderMessage } from './messages';

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
 * → `overrides.ru` → встроенный русский. Для не-`EimzoError` возвращает `error.message`.
 */
export function formatEimzoError(
  error: unknown,
  locale: EimzoLocale = DEFAULT_LOCALE,
  overrides: MessageOverrides = {},
): string {
  if (!(error instanceof EimzoError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const builtin = builtinMessages[locale as BuiltinLocale];
  return renderMessage(error.code as EimzoErrorCode, error.params as object, [overrides[locale], builtin, overrides[DEFAULT_LOCALE], ru]);
}
