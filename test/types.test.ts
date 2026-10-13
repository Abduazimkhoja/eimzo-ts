// Проверки типов публичного API: выполняются `npm run typecheck` (tsc) и не зависят от E-IMZO.
import { describe, expectTypeOf, it } from 'vitest';
import {
  createEimzo,
  EimzoError,
  isEimzoError,
  type EimzoBackend,
  type EimzoCallOptions,
  type EimzoErrorCode,
  type EimzoKey,
  type EimzoMessages,
  type MessageOverrides,
  type SignFileOptions,
  type SignOptions,
  type Transport,
} from '../src';

describe('типы публичного API', () => {
  it('login возвращает тип ответа backend', () => {
    const eimzo = createEimzo<{ token: string }>();
    expectTypeOf(eimzo.login).returns.resolves.toEqualTypeOf<{ token: string }>();
    expectTypeOf(createEimzo().login).returns.resolves.toBeUnknown();
  });

  it('isEimzoError сужает тип до params конкретного кода', () => {
    const error: unknown = null;
    if (isEimzoError(error, 'FILE_TOO_LARGE')) {
      expectTypeOf(error.params).toEqualTypeOf<{ size: number; max: number }>();
      expectTypeOf(error.code).toEqualTypeOf<'FILE_TOO_LARGE'>();
    }
    if (isEimzoError(error)) expectTypeOf(error.code).toEqualTypeOf<EimzoErrorCode>();
  });

  it('EimzoError требует params только там, где они есть', () => {
    // Только проверка типов: функция не вызывается.
    const constructors = () => [
      new EimzoError('CANCELLED'),
      new EimzoError('OUTDATED_VERSION', { installed: '4.0', min: '4.86' }),
      // @ts-expect-error нет обязательных params
      new EimzoError('OUTDATED_VERSION'),
      // @ts-expect-error неизвестный код
      new EimzoError('UNKNOWN_CODE'),
    ];
    expectTypeOf(constructors).returns.items.toMatchTypeOf<EimzoError>();
  });

  it('signal принимают все операции, которые можно отменить', () => {
    expectTypeOf<SignOptions>().toMatchTypeOf<EimzoCallOptions>();
    expectTypeOf<SignFileOptions>().toMatchTypeOf<EimzoCallOptions>();
    const eimzo = createEimzo();
    const signal = new AbortController().signal;
    expectTypeOf(eimzo.listKeys).toBeCallableWith({ signal });
    expectTypeOf(eimzo.listDevices).toBeCallableWith({ signal });
    expectTypeOf(eimzo.getVersion).toBeCallableWith({ signal });
    expectTypeOf(eimzo.init).toBeCallableWith({ signal });
    expectTypeOf(eimzo.login).toBeCallableWith('ckc', { signal });
    expectTypeOf(eimzo.call).toBeCallableWith('pfx', 'list_all_certificates', [], { signal });
  });

  it('совместимость: старые реализации транспорта и backend без параметра options подходят', () => {
    const transport = async () => ({ success: true });
    expectTypeOf(transport).toMatchTypeOf<Transport>();
    const backend = { getChallenge: async () => 'c', login: async (pkcs7: string) => pkcs7 };
    expectTypeOf(backend).toMatchTypeOf<EimzoBackend<string>>();
  });

  it('EimzoKey различается по type', () => {
    const key = {} as EimzoKey;
    if (key.type === 'pfx') expectTypeOf(key.alias).toBeString();
    else expectTypeOf(key.cardUID).toBeString();
  });

  it('свои тексты: частичные для языка, полный словарь — все коды', () => {
    expectTypeOf<{ en: { WRONG_PASSWORD: () => string } }>().toMatchTypeOf<MessageOverrides>();
    // @ts-expect-error в полном словаре нужны все коды
    const partial: EimzoMessages = { WRONG_PASSWORD: () => '' };
    void partial;
  });
});
