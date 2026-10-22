import type { EimzoKey } from 'eimzo-ts';
import { onMounted, ref } from 'vue';
import { eimzo, errorText } from '~/utils/eimzo';

/** Список ключей, загрузка ключа и подпись. Экземпляр Eimzo один на приложение (см. eimzo.ts). */
export function useEimzo() {
  const keys = ref<EimzoKey[]>([]);
  const loaded = ref(false);
  const error = ref<string | null>(null);
  const info = ref('');

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = errorText(e); // CANCELLED -> null: пользователь передумал
    }
  }

  // onMounted не вызывается при серверном рендере (Nuxt/SSR), поэтому к E-IMZO обращаемся здесь.
  onMounted(() =>
    run(async () => {
      const v = await eimzo.init();
      info.value = `E-IMZO ${v.major}.${v.minor} подключён.`;
      keys.value = await eimzo.listKeys();
    }),
  );

  return {
    keys,
    loaded,
    error,
    info,
    loadKey: (key: EimzoKey) =>
      run(async () => {
        await eimzo.loadKey(key);
        loaded.value = true;
      }),
    sign: (text: string) => run(() => eimzo.sign(text)),
    async logout() {
      await eimzo.unloadKey();
      loaded.value = false;
    },
  };
}
