'use client';

import type { EimzoKey } from 'eimzo-ts';
import { useCallback, useEffect, useState } from 'react';
import { eimzo, errorText } from '../lib/eimzo';

/** Список ключей, загрузка ключа и подпись. Экземпляр Eimzo один на приложение (см. eimzo.ts). */
export function useEimzo() {
  const [keys, setKeys] = useState<EimzoKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState('');

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorText(e)); // CANCELLED -> null: пользователь передумал
    }
  }, []);

  // Вызов только из useEffect — в браузере, а не при серверном рендере.
  useEffect(() => {
    void run(async () => {
      const v = await eimzo.init();
      setInfo(`E-IMZO ${v.major}.${v.minor} подключён.`);
      setKeys(await eimzo.listKeys());
    });
  }, [run]);

  return {
    keys,
    loaded,
    error,
    info,
    loadKey: (key: EimzoKey) =>
      run(async () => {
        await eimzo.loadKey(key);
        setLoaded(true);
      }),
    sign: (text: string) => run(() => eimzo.sign(text)),
    logout: async () => {
      await eimzo.unloadKey();
      setLoaded(false);
    },
  };
}
