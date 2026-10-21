import type { EimzoErrorCode, EimzoErrorParams, EimzoMessageKey, EimzoMessages } from './errors';

/** Размер в байтах → "12.3 MB" (одинаково для всех языков). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ключ текста: у кодов с необязательными параметрами есть отдельные тексты на каждый вариант. */
function messageKey(code: EimzoErrorCode, params: object): EimzoMessageKey {
  const p = params as EimzoErrorParams['BACKEND_ERROR'] & EimzoErrorParams['EIMZO_ERROR'];
  if (code === 'BACKEND_ERROR') return p.detail ? 'BACKEND_ERROR_DETAIL' : p.status ? 'BACKEND_ERROR_STATUS' : code;
  if (code === 'EIMZO_ERROR') return p.reason ? 'EIMZO_ERROR_REASON' : code;
  return code;
}

/** Подставляет `{name}` из параметров; неизвестное имя остаётся как есть. */
function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = vars[name];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : placeholder;
  });
}

/**
 * Текст ошибки: первый найденный в `dictionaries` (по порядку) шаблон для кода,
 * с подставленными параметрами. Последний словарь должен быть полным.
 */
export function renderMessage(
  code: EimzoErrorCode,
  params: object,
  dictionaries: ReadonlyArray<Partial<EimzoMessages> | undefined>,
): string {
  const key = messageKey(code, params);
  const vars: Record<string, unknown> = { ...params };
  if (code === 'FILE_TOO_LARGE') {
    const p = params as EimzoErrorParams['FILE_TOO_LARGE'];
    vars.size = formatSize(p.size);
    vars.max = formatSize(p.max);
  }
  const template = dictionaries.map((d) => d?.[key]).find((t) => typeof t === 'string');
  return interpolate(template ?? '', vars);
}
