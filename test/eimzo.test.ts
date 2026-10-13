import { describe, expect, it, vi } from 'vitest';
import { createEimzo, DEV_API_KEYS, EimzoError, type PfxKey } from '../src';
import { fakeTransport, PFX_ALIAS, VERSION_486 } from './helpers';

const pfxList = {
  success: true,
  certificates: [
    { disk: 'C:', path: 'DSKEYS', name: 'key1', alias: PFX_ALIAS },
    { disk: 'C:', path: 'DSKEYS', name: 'nokey', alias: 'cn=no ids' },
  ],
};

describe('init', () => {
  it('отклоняет устаревшую версию', async () => {
    const { transport } = fakeTransport({ version: { success: true, major: '4', minor: '12' } });
    await expect(createEimzo({ transport }).init()).rejects.toMatchObject({ code: 'OUTDATED_VERSION' });
  });

  it('передаёт API-ключи плоским массивом и сообщает об отказе', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      apikey: { success: false, reason: 'bad key' },
    });
    await expect(createEimzo({ transport, apiKeys: DEV_API_KEYS }).init()).rejects.toMatchObject({
      code: 'API_KEY_REJECTED',
      reason: 'bad key',
    });
    expect(calls[1].arguments).toEqual(['localhost', DEV_API_KEYS.localhost, '127.0.0.1', DEV_API_KEYS['127.0.0.1']]);
  });

  it('кеширует успешный init и повторяет после ошибки', async () => {
    let fail = true;
    const { transport, calls } = fakeTransport({
      version: () => (fail ? { success: false, reason: 'boom' } : VERSION_486),
    });
    const eimzo = createEimzo({ transport });
    await expect(eimzo.init()).rejects.toBeInstanceOf(EimzoError);
    fail = false;
    await eimzo.init();
    await eimzo.init();
    expect(calls.filter((c) => c.name === 'version')).toHaveLength(2);
  });
});

describe('listKeys', () => {
  it('E-IMZO >= 4.12: только PFX, ключи без ИНН/ПИНФЛ отброшены', async () => {
    const { transport, calls } = fakeTransport({ version: VERSION_486, 'pfx.list_all_certificates': pfxList });
    const keys = await createEimzo({ transport }).listKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ type: 'pfx', name: 'key1', CN: 'IVANOV IVAN' });
    expect(calls.some((c) => c.plugin === 'ftjc')).toBe(false);
  });

  it('старый E-IMZO: PFX + токены; ошибка одного источника не мешает другому', async () => {
    const { transport } = fakeTransport({
      version: { success: true, major: '3', minor: '40' },
      'pfx.list_all_certificates': { success: false, reason: 'no disk' },
      'ftjc.list_all_keys': { success: true, tokens: [{ cardUID: 'U1', info: PFX_ALIAS }] },
    });
    const keys = await createEimzo({ transport, minVersion: '3.37' }).listKeys();
    expect(keys).toEqual([expect.objectContaining({ type: 'ftjc', cardUID: 'U1' })]);
  });

  it('пробрасывает ошибку, если ключей нет и был сбой', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pfx.list_all_certificates': { success: false, reason: 'access denied' },
    });
    await expect(createEimzo({ transport }).listKeys()).rejects.toMatchObject({ reason: 'access denied' });
  });
});

describe('loadKey / sign', () => {
  const key = { type: 'pfx', disk: 'C:', path: 'DSKEYS', name: 'key1', alias: PFX_ALIAS } as PfxKey;

  it('подписывает загруженным keyId, текст кодируется в UTF-8 base64', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'PKCS7' },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey(key);
    expect(await eimzo.sign('Привет')).toBe('PKCS7');

    const create = calls.find((c) => c.name === 'create_pkcs7')!;
    expect(create.arguments).toEqual([Buffer.from('Привет', 'utf8').toString('base64'), 'K1', 'no']);
    expect(calls.find((c) => c.name === 'load_key')!.arguments).toEqual(['C:', 'DSKEYS', 'key1', PFX_ALIAS]);
  });

  it('detached, байты и аппаратный носитель', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    await eimzo.sign(new Uint8Array([1, 2, 3]), { detached: true });
    expect(calls.at(-1)!.arguments).toEqual(['AQID', 'ckc', 'yes']);
    expect(calls.some((c) => c.name === 'load_key')).toBe(false);
  });

  it('без ключа — KEY_NOT_LOADED, неверный пароль — WRONG_PASSWORD', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': { success: false, reason: 'javax.crypto.BadPaddingException: pad block corrupted' },
    });
    const eimzo = createEimzo({ transport });
    await expect(eimzo.sign('x')).rejects.toMatchObject({ code: 'KEY_NOT_LOADED' });
    await expect(eimzo.sign('x', { keyId: 'K' })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('неверный пароль в E-IMZO 6.3 (status -9999) — WRONG_PASSWORD', async () => {
    const reasons = [
      'Sequence tag error (at uz.eimzo.app.plugin.pkcs7.Pkcs7Plugin$2.handle:210)',
      'failed to decrypt safe contents entry: java.io.IOException: getSecretKey failed: Password is not ASCII',
    ];
    for (const reason of reasons) {
      const { transport } = fakeTransport({
        version: VERSION_486,
        'pkcs7.create_pkcs7': { success: false, status: -9999, reason },
      });
      const eimzo = createEimzo({ transport });
      await expect(eimzo.sign('x', { keyId: 'K' })).rejects.toMatchObject({ code: 'WRONG_PASSWORD', status: -9999 });
    }
  });

  it('«Отмена» в окне пароля — CANCELLED (реальный ответ E-IMZO 6.3)', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': { success: false, status: -5000, reason: 'Ввод пароля отменен' },
    });
    const eimzo = createEimzo({ transport });
    await expect(eimzo.sign('x', { keyId: 'K' })).rejects.toMatchObject({ code: 'CANCELLED', status: -5000 });
  });
});

describe('listDevices', () => {
  it('ошибка плагина = носителя нет', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'idcard.list_readers': { success: true, readers: ['r1'] },
      'baikey.list_tokens': { success: false, reason: 'driver missing' },
      'ckc.list_ckc': { success: true, devices: [] },
    });
    expect(await createEimzo({ transport }).listDevices()).toEqual({ idcard: true, baikey: false, ckc: false });
  });
});

describe('login / signDocument', () => {
  it('challenge → load_key → create_pkcs7(challenge) → backend.login', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'SIGNED' },
    });
    const backend = {
      getChallenge: vi.fn().mockResolvedValue('challenge-123'),
      login: vi.fn().mockResolvedValue({ token: 'jwt' }),
    };
    const eimzo = createEimzo({ transport, backend });
    const key = { type: 'pfx', disk: 'C:', path: 'p', name: 'n', alias: PFX_ALIAS } as PfxKey;

    expect(await eimzo.login(key)).toEqual({ token: 'jwt' });
    expect(backend.login).toHaveBeenCalledWith('SIGNED');
    expect(calls.find((c) => c.name === 'create_pkcs7')!.arguments![0]).toBe(
      Buffer.from('challenge-123').toString('base64'),
    );
    expect(eimzo.keyId).toBe('K1');
  });

  it('signDocument добавляет метку времени; без backend — BACKEND_NOT_CONFIGURED', async () => {
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    await expect(createEimzo({ transport }).signDocument('x', { keyId: 'K' })).rejects.toMatchObject({
      code: 'BACKEND_NOT_CONFIGURED',
    });
    const eimzo = createEimzo({ transport, backend: { timestamp: async (p) => p + '+TS' } });
    expect(await eimzo.signDocument('x', { keyId: 'K' })).toBe('P+TS');
  });
});
