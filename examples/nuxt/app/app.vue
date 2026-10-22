<script setup lang="ts">
import { ref } from 'vue';
import { mode } from '~/utils/eimzo';

const { keys, loaded, error, info, loadKey, sign, logout } = useEimzo();
const index = ref(0);
const text = ref('Тестовый документ');
const pkcs7 = ref('');

async function onSign() {
  pkcs7.value = (await sign(text.value)) ?? pkcs7.value;
}
</script>

<template>
  <!-- E-IMZO есть только в браузере: интерфейс рисуем на клиенте, на сервере — пусто -->
  <ClientOnly>
    <h1>eimzo-ts — Nuxt</h1>
    <p>
      {{
        mode === 'mock'
          ? 'Режим mock: E-IMZO не нужен, ключи вымышленные. ?mode=real — настоящий E-IMZO.'
          : 'Режим real: нужен запущенный E-IMZO.'
      }}
    </p>
    <p role="status" :class="{ error }">{{ error ?? info }}</p>
  
    <select v-model="index" aria-label="Ключ">
      <option v-for="(k, i) in keys" :key="k.serialNumber" :value="i" :disabled="k.expired">
        {{ k.CN }}{{ k.expired ? ' (срок истёк)' : '' }}
      </option>
    </select>
    <button :disabled="!keys[index]" @click="loadKey(keys[index]!)">Загрузить ключ</button>
    <hr />
    <textarea v-model="text" aria-label="Текст для подписи" />
    <button :disabled="!loaded" @click="onSign">Подписать</button>
    <button :disabled="!loaded" @click="logout">Выйти (выгрузить ключ)</button>
    <textarea :value="pkcs7" aria-label="PKCS#7" readonly placeholder="PKCS#7 (base64)" />
  </ClientOnly>
</template>

<style>
body { font: 16px system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
textarea { width: 100%; box-sizing: border-box; min-height: 5rem; }
.error { color: #b00020; }
</style>
