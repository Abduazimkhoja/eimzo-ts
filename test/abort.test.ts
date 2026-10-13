import { describe, expect, it, vi } from 'vitest';
import { createEimzo, createWebSocketTransport, type Eimzo, type PfxKey, type Transport } from '../src';
import { fakeTransport, PFX_ALIAS, VERSION_486 } from './helpers';

const key = { type: 'pfx', disk: 'C:', path: 'DSKEYS', name: 'key1', alias: PFX_ALIAS } as PfxKey;
const aborted = (reason = new DOMException('stop', 'AbortError')) => AbortSignal.abort(reason);

describe('createWebSocketTransport: signal', () => {
  it('уже отменённый signal — соединение не открывается', async () => {
    const WS = vi.fn();
    const transport = createWebSocketTransport({ WebSocketImpl: WS as unknown as typeof WebSocket });
    const reason = new Error('gone');
    await expect(transport({ name: 'version' }, { signal: aborted(reason as DOMException) })).rejects.toBe(reason);
    expect(WS).not.toHaveBeenCalled();
  });

  it('отмена во время вызова закрывает соединение', async () => {
    let socket!: { close: ReturnType<typeof vi.fn> };
    class FakeWS {
      onopen: (() => void) | null = null;
      close = vi.fn();
      constructor() { socket = this; }
      send() {}
    }
    const controller = new AbortController();
    const result = createWebSocketTransport({ WebSocketImpl: FakeWS as unknown as typeof WebSocket })(
      { name: 'version' },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(socket.close).toHaveBeenCalledOnce();
  });
});

describe('Eimzo: signal', () => {
  it('передаёт signal в транспорт', async () => {
    const { transport, calls, signals } = fakeTransport({
      version: VERSION_486,
      'pfx.list_all_certificates': { success: true, certificates: [] },
    });
    const controller = new AbortController();
    await createEimzo({ transport }).listKeys({ signal: controller.signal });
    expect(signals[calls.findIndex((c) => c.name === 'list_all_certificates')]).toBe(controller.signal);
  });

  it('отменённая операция в очереди не запускается, следующая выполняется', async () => {
    let release!: () => void;
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': (req) =>
        req.arguments![0] === 'Zmlyc3Q=' // "first"
          ? new Promise((resolve) => (release = () => resolve({ success: true, pkcs7_64: 'P1' })))
          : { success: true, pkcs7_64: 'P' },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    const first = eimzo.sign('first');
    const controller = new AbortController();
    const second = eimzo.sign('second', { signal: controller.signal });
    const third = eimzo.sign('third');

    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await expect(first).resolves.toBe('P1');
    await expect(third).resolves.toBe('P');
    expect(calls.filter((c) => c.name === 'create_pkcs7')).toHaveLength(2);
  });

  it('отмена запущенной подписи освобождает вызывающего, но очередь ждёт ответа E-IMZO: второго окна пароля нет', async () => {
    let active = 0;
    let maxActive = 0;
    let finishFirst!: () => void;
    const { transport, signals, calls } = fakeTransport({
      version: VERSION_486,
      'pkcs7.create_pkcs7': (req) => {
        maxActive = Math.max(maxActive, ++active);
        const done = () => {
          active--;
          return { success: true, pkcs7_64: String(req.arguments![0]) };
        };
        if (req.arguments![0] !== 'Zmlyc3Q=') return done(); // "first" ждёт пароля
        return new Promise((resolve) => (finishFirst = () => resolve(done())));
      },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    const controller = new AbortController();
    const first = eimzo.sign('first', { signal: controller.signal });
    await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'));
    const second = eimzo.sign('second');

    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.filter((c) => c.name === 'create_pkcs7')).toHaveLength(1); // second ещё ждёт
    finishFirst();
    await expect(second).resolves.toBe('c2Vjb25k');
    expect(maxActive).toBe(1);
    // Вызов, который может открыть окно пароля, не обрывается отменой.
    expect(signals[calls.findIndex((c) => c.name === 'create_pkcs7')]).toBeUndefined();
  });

  it('отмена одного вызова не ломает общий init', async () => {
    let answer!: () => void;
    const { transport } = fakeTransport({
      version: () => new Promise((resolve) => (answer = () => resolve(VERSION_486))),
    });
    const eimzo = createEimzo({ transport });
    const controller = new AbortController();
    const cancelled = eimzo.listKeys({ signal: controller.signal });
    const other = eimzo.init();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    answer();
    await expect(other).resolves.toEqual({ major: 4, minor: 86 });
  });

  it('login передаёт signal в backend', async () => {
    const getChallenge = vi.fn().mockResolvedValue('challenge');
    const login = vi.fn().mockResolvedValue({ ok: true });
    const { transport } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    const controller = new AbortController();
    const eimzo = createEimzo({ transport, backend: { getChallenge, login } });
    await expect(eimzo.login(key, { signal: controller.signal })).resolves.toEqual({ ok: true });
    expect(getChallenge).toHaveBeenCalledWith({ signal: controller.signal });
    expect(login).toHaveBeenCalledWith('P', { signal: controller.signal });
  });

  it('signDocument передаёт signal в backend.timestamp', async () => {
    const timestamp = vi.fn().mockResolvedValue('TS');
    const { transport } = fakeTransport({ version: VERSION_486, 'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' } });
    const controller = new AbortController();
    const eimzo = createEimzo({ transport, backend: { timestamp } });
    await eimzo.loadKey('ckc');
    await expect(eimzo.signDocument('x', { signal: controller.signal })).resolves.toBe('TS');
    expect(timestamp).toHaveBeenCalledWith('P', { signal: controller.signal });
  });

  it('уже отменённый signal до первого init — без запроса version и без необработанного отказа', async () => {
    const { transport, calls } = fakeTransport({ version: { success: false, reason: 'down' } });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await expect(createEimzo({ transport }).listKeys({ signal: aborted() })).rejects.toMatchObject({ name: 'AbortError' });
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toHaveLength(0);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it.each([false, true])('отмена loadKey во время load_key выгружает ключ (verifyPassword: %s)', async (verifyPassword) => {
    const controller = new AbortController();
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': () => {
        controller.abort();
        return { success: true, keyId: 'K1' };
      },
      'pfx.unload_key': { success: true },
    });
    const eimzo = createEimzo({ transport });
    await expect(eimzo.loadKey(key, { verifyPassword, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(calls.find((c) => c.name === 'unload_key')?.arguments).toEqual(['K1']));
    expect(calls.some((c) => c.name === 'verify_password')).toBe(false);
    // Состояние очищается после ответа на unload_key — ждём результата, а не вызова.
    await vi.waitFor(() => expect(eimzo.keyId).toBeNull());
  });

  it('уже отменённый signal — E-IMZO не вызывается', async () => {
    const { transport, calls } = fakeTransport({ version: VERSION_486 });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey('ckc');
    await expect(eimzo.sign('x', { signal: aborted() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.some((c) => c.name === 'create_pkcs7')).toBe(false);
  });
});

describe('отмена: порядок событий', () => {
  it('sign, отменённый во время init, не отправляет create_pkcs7', async () => {
    let answer!: () => void;
    const { transport, calls } = fakeTransport({
      version: () => new Promise((resolve) => (answer = () => resolve(VERSION_486))),
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    const eimzo = createEimzo({ transport });
    const controller = new AbortController();
    const result = eimzo.sign('x', { keyId: 'K', signal: controller.signal });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    answer();
    await eimzo.init();
    expect(calls.some((c) => c.name === 'create_pkcs7')).toBe(false);
  });

  it('loadKey, отменённый во время init, не вызывает load_key', async () => {
    let answer!: () => void;
    const { transport, calls } = fakeTransport({
      version: () => new Promise((resolve) => (answer = () => resolve(VERSION_486))),
      'pfx.load_key': { success: true, keyId: 'K1' },
    });
    const eimzo = createEimzo({ transport });
    const controller = new AbortController();
    const result = eimzo.loadKey(key, { signal: controller.signal });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    answer();
    await eimzo.init();
    expect(calls.some((c) => c.name === 'load_key')).toBe(false);
    expect(eimzo.keyId).toBeNull();
  });

  it('отмена во время create_pkcs7 с ответом KEY_NOT_FOUND не сбрасывает keyId', async () => {
    const controller = new AbortController();
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pkcs7.create_pkcs7': () => {
        controller.abort();
        return { success: false, status: -1010, reason: 'Ключ по идентификатору не найден' };
      },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey(key);
    await expect(eimzo.sign('x', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await eimzo.init(); // дать очереди завершиться
    expect(eimzo.keyId).toBe('K1'); // следующий sign сам перезагрузит ключ
    expect(calls.filter((c) => c.name === 'load_key')).toHaveLength(1);
  });

  it('loadKey, отменённый во время повторного init, не выгружает прежний ключ', async () => {
    let versionCalls = 0;
    let answer!: () => void;
    const { transport, calls } = fakeTransport({
      version: () => {
        versionCalls++;
        if (versionCalls === 2) return { success: false, reason: 'restart' };
        if (versionCalls === 3) return new Promise((resolve) => (answer = () => resolve(VERSION_486)));
        return VERSION_486;
      },
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pfx.unload_key': { success: true },
      'pfx.list_all_certificates': { success: true, certificates: [] },
    });
    const eimzo = createEimzo({ transport });
    await eimzo.loadKey(key);
    // Ошибка init сбрасывает кеш: следующий вызов запустит init заново.
    (eimzo as unknown as { ready: null }).ready = null;
    await expect(eimzo.listKeys()).rejects.toMatchObject({ reason: 'restart' });
    const controller = new AbortController();
    const result = eimzo.loadKey(key, { signal: controller.signal });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    answer();
    await eimzo.init();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((c) => c.name === 'unload_key')).toBe(false);
    expect(eimzo.keyId).toBe('K1');
  });

  it.each(['pkcs7.create_pkcs7', 'backend.login'])(
    'login, отменённый на шаге %s, выгружает загруженный им ключ',
    async (step) => {
      const controller = new AbortController();
      const { transport, calls } = fakeTransport({
        version: VERSION_486,
        'pfx.load_key': { success: true, keyId: 'K1' },
        'pfx.unload_key': { success: true },
        'pkcs7.create_pkcs7': () => {
          if (step === 'pkcs7.create_pkcs7') controller.abort();
          return { success: true, pkcs7_64: 'P' };
        },
      });
      const backend = {
        getChallenge: async () => 'challenge',
        login: vi.fn(() => {
          controller.abort();
          return new Promise<never>(() => {}); // backend не поддерживает signal
        }),
      };
      const eimzo = createEimzo({ transport, backend });
      await expect(eimzo.login(key, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
      // Подпись с явным keyId встаёт в очередь за login и сама ничего не выгружает.
      await eimzo.sign('y', { keyId: 'KX' });
      expect(calls.filter((c) => c.name === 'unload_key').map((c) => c.arguments)).toEqual([['K1']]);
      expect(eimzo.keyId).toBeNull();
    },
  );

  it('ошибка входа без отмены (например, 403 от backend) ключ не выгружает', async () => {
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': { success: true, keyId: 'K1' },
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    const backend = { getChallenge: async () => 'challenge', login: async () => Promise.reject(new Error('403')) };
    const eimzo = createEimzo({ transport, backend });
    await expect(eimzo.login(key)).rejects.toThrow('403');
    expect(eimzo.keyId).toBe('K1');
    expect(calls.some((c) => c.name === 'unload_key')).toBe(false);
  });

  it('getChallenge без поддержки signal не держит очередь после отмены login', async () => {
    const { transport } = fakeTransport({ version: VERSION_486, 'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' } });
    const backend = { getChallenge: vi.fn(() => new Promise<string>(() => {})), login: vi.fn() };
    const eimzo = createEimzo({ transport, backend });
    await eimzo.loadKey('ckc');
    const controller = new AbortController();
    const login = eimzo.login(key, { signal: controller.signal });
    const sign = eimzo.sign('x');
    await vi.waitFor(() => expect(backend.getChallenge).toHaveBeenCalled());
    controller.abort();
    await expect(login).rejects.toMatchObject({ name: 'AbortError' });
    await expect(sign).resolves.toBe('P');
  });

  it('login, отменённый во время getChallenge без поддержки signal, не трогает прежний ключ', async () => {
    let giveChallenge!: (challenge: string) => void;
    let loads = 0;
    const { transport, calls } = fakeTransport({
      version: VERSION_486,
      'pfx.load_key': () => ({ success: true, keyId: `K${++loads}` }),
      'pfx.unload_key': { success: true },
      'pkcs7.create_pkcs7': { success: true, pkcs7_64: 'P' },
    });
    const backend = {
      getChallenge: () => new Promise<string>((resolve) => (giveChallenge = resolve)),
      login: vi.fn(),
    };
    const eimzo = createEimzo({ transport, backend });
    await eimzo.loadKey(key);
    const controller = new AbortController();
    const result = eimzo.login(key, { signal: controller.signal });
    await vi.waitFor(() => expect(giveChallenge).toBeTypeOf('function'));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    giveChallenge('challenge');
    // sign встаёт в очередь после login и подписывает прежним ключом.
    await expect(eimzo.sign('x')).resolves.toBe('P');
    expect(eimzo.keyId).toBe('K1');
    expect(calls.filter((c) => c.name === 'load_key')).toHaveLength(1);
    expect(calls.some((c) => c.name === 'unload_key')).toBe(false);
    expect(backend.login).not.toHaveBeenCalled();
  });
});

describe('отмена на каждом шаге каждой операции из очереди', () => {
  type Run = (eimzo: Eimzo<unknown>, signal: AbortSignal) => Promise<unknown>;
  const operations: [string, Run][] = [
    ['loadKey + verifyPassword', (e, signal) => e.loadKey(key, { verifyPassword: true, signal })],
    ['sign', (e, signal) => e.sign('x', { signal })],
    ['signFile', (e, signal) => e.signFile(new Blob(['x']), { signal })],
    ['login', (e, signal) => e.login(key, { signal })],
    ['signDocument', (e, signal) => e.signDocument('x', { signal })],
  ];

  /**
   * Каждый вызов E-IMZO и backend — шаг. На шаге `abortAt` операция отменяется:
   * E-IMZO всё равно отвечает (пользователь закрыл окно), backend игнорирует signal и не отвечает никогда.
   */
  async function setup(abortAt: number) {
    const controller = new AbortController();
    const steps: string[] = [];
    const afterAbort: string[] = [];
    let counting = false;
    let loads = 0;
    const record = (name: string) => {
      if (!counting) return false;
      if (controller.signal.aborted) afterAbort.push(name);
      steps.push(name);
      if (steps.length - 1 === abortAt) controller.abort();
      return controller.signal.aborted;
    };
    const transport: Transport = async (req) => {
      const id = req.name === 'unload_key' ? `:${String(req.arguments![0])}` : '';
      record(`${req.plugin ?? ''}.${req.name}${id}`);
      if (req.name === 'version') return VERSION_486;
      if (req.name === 'load_key') return { success: true, keyId: `K${loads++}` };
      if (req.name === 'create_pkcs7') return { success: true, pkcs7_64: 'P' };
      return { success: true };
    };
    const never = new Promise<never>(() => {});
    const backend = {
      getChallenge: () => (record('backend.getChallenge') ? never : Promise.resolve('challenge')),
      login: () => (record('backend.login') ? never : Promise.resolve({ ok: true })),
      timestamp: () => (record('backend.timestamp') ? never : Promise.resolve('TS')),
    };
    const eimzo = createEimzo({ transport, backend });
    await eimzo.loadKey(key);
    counting = true;
    const stop = () => (counting = false);
    return { eimzo, controller, steps, afterAbort, stop };
  }

  it.each(operations)('%s', async (_name, run) => {
    const dry = await setup(-1);
    await run(dry.eimzo, dry.controller.signal);
    expect(dry.steps.length).toBeGreaterThan(0);

    for (let abortAt = 0; abortAt < dry.steps.length; abortAt++) {
      const { eimzo, controller, afterAbort, stop } = await setup(abortAt);
      const context = `отмена на шаге ${abortAt} (${dry.steps[abortAt]})`;
      await expect(run(eimzo, controller.signal), context).rejects.toMatchObject({ name: 'AbortError' });
      // Контрольная подпись встаёт в очередь за отменённой операцией: она выполнится,
      // только когда отменённая доработает, и не даст ей ничего отправить незамеченным.
      const control = eimzo.sign('y', { keyId: 'KX' });
      await expect(control, context).resolves.toBe('P');
      stop();
      // Очередь не заблокирована, даже если backend так и не ответил,
      // и после отмены от имени отменённой операции ничего не отправлено.
      // Последний запрос — контрольная подпись. До неё допустима только очистка:
      // выгрузка ключа K1, который успела загрузить сама отменённая операция.
      expect(afterAbort.at(-1), context).toBe('pkcs7.create_pkcs7');
      expect(afterAbort.slice(0, -1).filter((s) => s !== 'pfx.unload_key:K1'), context).toEqual([]);
    }
  });
});
