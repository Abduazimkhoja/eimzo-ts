export interface CertificateInfo {
  serialNumber: string;
  /** ФИО владельца. */
  CN: string;
  /** ИНН; для физлиц без ИНН — UID, как в e-imzo-client.js. */
  TIN: string;
  PINFL: string;
  UID: string;
  /** Организация. */
  O: string;
  /** Должность. */
  T: string;
  validFrom: Date | null;
  validTo: Date | null;
  /** Срок действия истёк на момент получения списка. */
  expired: boolean;
}

export interface PfxKey extends CertificateInfo {
  type: 'pfx';
  disk: string;
  path: string;
  name: string;
  alias: string;
}

/** Токен, найденный плагином `ftjc` (только E-IMZO старше 4.12). */
export interface TokenKey extends CertificateInfo {
  type: 'ftjc';
  cardUID: string;
  statusInfo: string;
  ownerName: string;
  info: string;
}

export type EimzoKey = PfxKey | TokenKey;

const OID_ALIASES: Record<string, string> = {
  '1.2.860.3.16.1.1': 'INN',
  '1.2.860.3.16.1.2': 'PINFL',
};

// Атрибут начинается в начале строки или после запятой: `cn=...,1.2.860.3.16.1.2=...`
const ATTRIBUTE_START = /(?:^|,)\s*([A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)+)=/g;

/**
 * Разбирает строку вида `cn=Иванов,uid=123,validto=2024.09.24 23:59:59` в словарь
 * с ключами в верхнем регистре. Значения могут содержать запятые.
 */
export function parseX500(source: string): Record<string, string> {
  const matches: { key: string; start: number; end: number }[] = [];
  ATTRIBUTE_START.lastIndex = 0;
  for (let m = ATTRIBUTE_START.exec(source); m; m = ATTRIBUTE_START.exec(source)) {
    matches.push({ key: m[1], start: m.index, end: m.index + m[0].length });
  }
  const result: Record<string, string> = {};
  matches.forEach((m, i) => {
    const key = OID_ALIASES[m.key] ?? m.key.toUpperCase();
    const value = source.slice(m.end, i + 1 < matches.length ? matches[i + 1].start : source.length);
    if (!(key in result)) result[key] = value;
  });
  return result;
}

/** PFX отдаёт даты как `2022.09.24 17:29:21`, токены — в формате, понятном `Date`. */
export function parseEimzoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}\.\d{2}\.\d{2}/.test(value)
    ? value.replace(/\./g, '-').replace(' ', 'T')
    : value;
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

/** Возвращает `null` для сертификатов без ИНН и ПИНФЛ — e-imzo-client.js их пропускает. */
export function parseCertificateInfo(x500: string, now: Date = new Date()): CertificateInfo | null {
  const a = parseX500(x500);
  const TIN = a.INN || a.UID || '';
  const PINFL = a.PINFL || '';
  if (!TIN && !PINFL) return null;
  const validTo = parseEimzoDate(a.VALIDTO);
  // E-IMZO отдаёт alias в нижнем регистре; как и e-imzo-client.js, показываем имена заглавными.
  const upper = (value: string | undefined) => (value || '').toUpperCase();
  return {
    serialNumber: a.SERIALNUMBER || '',
    CN: upper(a.CN),
    TIN,
    PINFL,
    UID: a.UID || '',
    O: upper(a.O),
    T: upper(a.T),
    validFrom: parseEimzoDate(a.VALIDFROM),
    validTo,
    expired: validTo !== null && validTo.getTime() < now.getTime(),
  };
}
