import { describe, expect, it } from 'vitest';
import { builtinMessages, createEimzo, EimzoError, formatEimzoError, ru } from '../src';
import { fakeTransport, VERSION_486 } from './helpers';

const wrongPassword = { success: false, reason: 'BadPaddingException' };

describe('локализация', () => {
  it('по умолчанию message на русском', () => {
    expect(new EimzoError('WRONG_PASSWORD').message).toBe('Неверный пароль.');
  });

  it('message ошибки — на языке экземпляра, с подстановкой параметров', async () => {
    const { transport } = fakeTransport({ version: { success: true, major: '4', minor: '12' } });
    const eimzo = createEimzo({ transport, locale: 'uz-Latn' });
    await expect(eimzo.init()).rejects.toMatchObject({
      code: 'OUTDATED_VERSION',
      params: { installed: '4.12', min: '4.86' },
      message: expect.stringMatching(/^E-IMZO dasturining eskirgan versiyasi oʻrnatilgan \(4\.12\)\. 4\.86 yoki/),
    });
  });

  it('setLocale меняет язык следующих ошибок, t() переводит уже пойманную', async () => {
    const { transport } = fakeTransport({ version: VERSION_486, 'pkcs7.create_pkcs7': wrongPassword });
    const eimzo = createEimzo({ transport, locale: 'kaa' });

    const error = await eimzo.sign('x', { keyId: 'K' }).catch((e) => e);
    expect(error.message).toBe('Parol qáte.');

    eimzo.setLocale('uz-Cyrl');
    expect(eimzo.t(error)).toBe('Парол нотўғри.');
    expect(eimzo.t(error, 'en')).toBe('Wrong password.');
    await expect(eimzo.sign('x', { keyId: 'K' })).rejects.toMatchObject({ message: 'Парол нотўғри.' });
  });

  it('свои тексты: замена одного сообщения и новый язык с откатом на русский', async () => {
    const { transport } = fakeTransport({ version: VERSION_486, 'pkcs7.create_pkcs7': wrongPassword });
    const eimzo = createEimzo({
      transport,
      locale: 'kk',
      messages: {
        ru: { WRONG_PASSWORD: () => 'Пароль не подошёл' },
        kk: { WRONG_PASSWORD: () => 'Құпиясөз қате.' },
      },
    });
    const error = await eimzo.sign('x', { keyId: 'K' }).catch((e) => e);
    expect(error.message).toBe('Құпиясөз қате.');
    expect(eimzo.t(error, 'ru')).toBe('Пароль не подошёл');
    expect(eimzo.t(new EimzoError('KEY_NOT_LOADED'))).toBe(ru.KEY_NOT_LOADED({})); // нет в kk → русский
  });

  it('formatEimzoError работает без экземпляра и для обычных ошибок', () => {
    const e = new EimzoError('BACKEND_ERROR', { status: 503 });
    expect(formatEimzoError(e, 'en')).toBe('Server error (HTTP 503).');
    expect(formatEimzoError(new Error('boom'), 'uz-Latn')).toBe('boom');
    expect(formatEimzoError(e, 'xx')).toBe('Ошибка сервера (HTTP 503).');
  });

  it('во всех встроенных языках есть все сообщения, и они не пустые', () => {
    const codes = Object.keys(ru);
    for (const [locale, messages] of Object.entries(builtinMessages)) {
      expect(Object.keys(messages).sort(), locale).toEqual([...codes].sort());
      for (const fn of Object.values(messages)) {
        expect((fn as (p: object) => string)({ installed: '1.0', min: '2.0', methods: 'm', size: 2, max: 1 }).length).toBeGreaterThan(0);
      }
    }
  });
});
