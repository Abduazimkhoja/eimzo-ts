import { describe, expect, it } from 'vitest';
import { createEimzo, type EimzoRequest, type PfxKey } from '../src';
import { fakeTransport, PFX_ALIAS, VERSION_486 } from './helpers';

const key = { type: 'pfx', disk: 'C:\\', path: 'DSKEYS', name: 'key1', alias: PFX_ALIAS } as PfxKey;
// Реальные ответы E-IMZO 6.3.5
const KEY_NOT_FOUND = { success: false, status: -1010, reason: 'Ключ по идентификатору не найден' };
const UNLOAD_NOT_FOUND = { success: false, status: -1014, reason: "Идентификатор ключа типа 'PFX_KEY_STORE' не найден" };

const signCalls = (calls: EimzoRequest[]) => calls.filter((c) => c.name === 'create_pkcs7');

describe('устаревший keyId', () => {
  it('KEY_NOT_FOUND → ключ загружается заново и подпись повторяется', async () => {
    let loads = 0;
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': () => ({ success: true, keyId: `K${++loads}` }),
      'pfx.unload_key': UNLOAD_NOT_FOUND,
      'pkcs7.create_pkcs7': (req) =>
        req.arguments![1] === 'K1' ? KEY_NOT_FOUND : { success: true, pkcs7_64: 'SIGNED' },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey(key);

    expect(await eimzo.sign('x')).toBe('SIGNED');
    expect(signCalls(calls).map((c) => c.arguments![1])).toEqual(['K1', 'K2']);
    expect(eimzo.keyId).toBe('K2');
  });

  it('без перезагрузки — ошибка KEY_NOT_FOUND со status', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pkcs7.create_pkcs7': KEY_NOT_FOUND,
    });
    const eimzo = createEimzo({ transport, autoReloadKey: false });
    await eimzo.loadKey(key);
    await expect(eimzo.sign('x')).rejects.toMatchObject({ code: 'KEY_NOT_FOUND', status: -1010 });

    // Явный keyId тоже не перезагружается: мы не знаем, какой это ключ.
    const other = createEimzo({ transport });
    await expect(other.sign('x', { keyId: 'K9' })).rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
  });
});

describe('unloadKey / смена ключа', () => {
  it('unloadKey выгружает PFX из E-IMZO и забывает keyId', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pfx.unload_key': { success: true },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey(key);
    await eimzo.unloadKey();
    expect(calls.find((c) => c.name === 'unload_key')!.arguments).toEqual(['K1']);
    expect(eimzo.keyId).toBeNull();
    await expect(eimzo.sign('x')).rejects.toMatchObject({ code: 'KEY_NOT_LOADED' });
  });

  it('уже выгруженный ключ — не ошибка; повторная загрузка выгружает предыдущий', async () => {
    let loads = 0;
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': () => ({ success: true, keyId: `K${++loads}` }),
      'pfx.unload_key': UNLOAD_NOT_FOUND,
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey(key);
    await eimzo.loadKey(key);
    expect(calls.filter((c) => c.name === 'unload_key').map((c) => c.arguments)).toEqual([['K1']]);
    await expect(eimzo.unloadKey()).resolves.toBeUndefined();
  });

  it('аппаратный носитель не выгружается', async () => {
    const { transport, calls } = fakeTransport({ version: VERSION_486 });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    await eimzo.unloadKey();
    expect(calls.some((c) => c.name === 'unload_key')).toBe(false);
  });
});

describe('signFile', () => {
  it('detached по умолчанию, байты файла в base64', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    const file = new Blob([new Uint8Array([1, 2, 3])]);
    expect(await eimzo.signFile(file)).toBe('P');
    expect(signCalls(calls)[0].arguments).toEqual(['AQID', 'ckc', 'yes']);

    await eimzo.signFile(file, { detached: false });
    expect(signCalls(calls)[1].arguments![2]).toBe('no');
  });

  it('слишком большой файл — FILE_TOO_LARGE до чтения и без вызова E-IMZO', async () => {
    const { transport, calls } = fakeTransport({ version: VERSION_486 });
    const eimzo = createEimzo({ transport, locale: 'en' });
    await eimzo.loadKey('ckc');
    const file = new Blob([new Uint8Array(2048)]);
    await expect(eimzo.signFile(file, { maxSize: 1024 })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      params: { size: 2048, max: 1024 },
      message: 'File is too large (2.0 KB). Maximum is 1.0 KB.',
    });
    expect(signCalls(calls)).toHaveLength(0);
  });
});

describe('очередь', () => {
  it('одновременные подписи идут строго по одной', async () => {
    let active = 0;
    let maxActive = 0;
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': async () => {
        maxActive = Math.max(maxActive, ++active);
        await new Promise((r) => setTimeout(r, 10)); // пользователь вводит пароль
        active--;
        return { success: true, pkcs7_64: 'P' };
      },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    await Promise.all([eimzo.sign('a'), eimzo.sign('b'), eimzo.signFile(new Blob(['c']))]);
    expect(maxActive).toBe(1);
  });

  it('ошибка одной операции не блокирует следующие', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': (req) =>
        req.arguments![0] === 'YmFk' ? { success: false, reason: 'BadPaddingException' } : { success: true, pkcs7_64: 'P' },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    const [bad, good] = await Promise.allSettled([eimzo.sign('bad'), eimzo.sign('good')]);
    expect(bad).toMatchObject({ status: 'rejected', reason: { code: 'WRONG_PASSWORD' } });
    expect(good).toEqual({ status: 'fulfilled', value: 'P' });
  });
});
