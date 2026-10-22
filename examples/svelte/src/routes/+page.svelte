<script lang="ts">
  import type { EimzoKey } from 'eimzo-ts';
  import { onMount } from 'svelte';
  import { eimzo, errorText, mode } from '$lib/eimzo';

  let keys = $state<EimzoKey[]>([]);
  let index = $state(0);
  let loaded = $state(false);
  let text = $state('Тестовый документ');
  let pkcs7 = $state('');
  let error = $state<string | null>(null);
  let info = $state('');

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    error = null;
    try {
      return await fn();
    } catch (e) {
      error = errorText(e); // CANCELLED -> null: пользователь передумал
    }
  }

  // onMount не вызывается при серверном рендере, поэтому к E-IMZO обращаемся здесь.
  onMount(() =>
    run(async () => {
      const v = await eimzo.init();
      info = `E-IMZO ${v.major}.${v.minor} подключён.`;
      keys = await eimzo.listKeys();
    }),
  );

  const load = () =>
    run(async () => {
      await eimzo.loadKey(keys[index]!);
      loaded = true;
    });

  async function sign() {
    pkcs7 = (await run(() => eimzo.sign(text))) ?? pkcs7;
  }

  async function logout() {
    await eimzo.unloadKey();
    loaded = false;
  }
</script>

<h1>eimzo-ts — SvelteKit</h1>
<p>
  {mode === 'mock'
    ? 'Режим mock: E-IMZO не нужен, ключи вымышленные. ?mode=real — настоящий E-IMZO.'
    : 'Режим real: нужен запущенный E-IMZO.'}
</p>
<p role="status" class:error>{error ?? info}</p>

<select bind:value={index} aria-label="Ключ">
  {#each keys as k, i (k.serialNumber)}
    <option value={i} disabled={k.expired}>{k.CN}{k.expired ? ' (срок истёк)' : ''}</option>
  {/each}
</select>
<button disabled={!keys[index]} onclick={load}>Загрузить ключ</button>
<hr />
<textarea bind:value={text} aria-label="Текст для подписи"></textarea>
<button disabled={!loaded} onclick={sign}>Подписать</button>
<button disabled={!loaded} onclick={logout}>Выйти (выгрузить ключ)</button>
<textarea value={pkcs7} aria-label="PKCS#7" readonly placeholder="PKCS#7 (base64)"></textarea>

<style>
  :global(body) { font: 16px system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
  textarea { width: 100%; box-sizing: border-box; min-height: 5rem; }
  .error { color: #b00020; }
</style>
