import type { EimzoKey } from 'eimzo-ts';
import { eimzo, errorText, mode } from './eimzo';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let keys: EimzoKey[] = [];

const status = (text: string, isError = false) => {
  $('status').textContent = text;
  $('status').className = isError ? 'error' : '';
};
const fail = (e: unknown) => {
  const text = errorText(e);
  if (text) status(text, true);
};

$('mode').textContent =
  mode === 'mock' ? 'Режим mock: E-IMZO не нужен, ключи вымышленные. ?mode=real — настоящий E-IMZO.' : 'Режим real: нужен запущенный E-IMZO.';

async function start() {
  try {
    const v = await eimzo.init();
    status(`E-IMZO ${v.major}.${v.minor} подключён.`);
    keys = await eimzo.listKeys();
    $<HTMLSelectElement>('keys').replaceChildren(
      ...keys.map((k, i) => Object.assign(new Option(`${k.CN}${k.expired ? ' (срок истёк)' : ''}`, String(i)), { disabled: k.expired })),
    );
    $<HTMLButtonElement>('load').disabled = keys.length === 0;
  } catch (e) {
    fail(e);
  }
}

$('load').onclick = async () => {
  const key = keys[Number($<HTMLSelectElement>('keys').value)];
  if (!key) return;
  try {
    await eimzo.loadKey(key);
    $<HTMLButtonElement>('sign').disabled = $<HTMLButtonElement>('logout').disabled = false;
    status('Ключ загружен.');
  } catch (e) {
    fail(e);
  }
};

$('sign').onclick = async () => {
  try {
    $<HTMLTextAreaElement>('pkcs7').value = await eimzo.sign($<HTMLTextAreaElement>('data').value);
    status('Готово.');
  } catch (e) {
    fail(e);
  }
};

$('logout').onclick = async () => {
  await eimzo.unloadKey();
  $<HTMLButtonElement>('sign').disabled = $<HTMLButtonElement>('logout').disabled = true;
  status('Ключ выгружен.');
};

void start();
