// Проверка собранной библиотеки (dist) на настоящем E-IMZO этого компьютера.
//
//   node scripts/check-real-eimzo.mjs                — без окон: версия, ключи, носители, ошибки keyId
//   node scripts/check-real-eimzo.mjs --interactive 2 — плюс подписи ключом №2 (будут окна пароля)
//
// Личные данные ключей в выводе маскируются. Подписи никуда не отправляются.
import { createEimzo, DEV_API_KEYS } from '../dist/index.js';

const interactive = process.argv.includes('--interactive');
const keyIndex = Number(process.argv[process.argv.indexOf('--interactive') + 1] ?? 0);

// В Node у WebSocket нет Origin; E-IMZO проверяет API-ключ по нему.
class LocalhostWebSocket extends WebSocket {
  constructor(url) {
    super(url, { headers: { Origin: 'http://localhost' } });
  }
}

const eimzo = createEimzo({ apiKeys: DEV_API_KEYS, WebSocketImpl: LocalhostWebSocket });
const mask = (s) => (s ? s.replace(/\S/g, (c, i) => (i === 0 ? c : '*')) : '—');
const fmt = (d) => (d ? d.toISOString().slice(0, 10) : '—');
const describeError = (e) => `${e.code ?? e.name} | status=${e.status ?? '—'} | reason=${e.reason ?? '—'} | ${e.message}`;

/**
 * `expectCode` — ожидаемая ошибка: её появление считается успехом шага.
 * Проваленный шаг выставляет ненулевой код завершения, остальные шаги всё равно выполняются.
 */
async function step(title, fn, expectCode) {
  let ok;
  try {
    const result = await fn();
    ok = expectCode === undefined;
    console.log(`${ok ? '✔' : '✘'} ${title}${result !== undefined ? ': ' + result : ''}`);
  } catch (e) {
    ok = expectCode !== undefined && e.code === expectCode;
    console.log(`${ok ? '✔' : '✘'} ${title}: ${describeError(e)}`);
  }
  if (!ok) process.exitCode = 1;
}

const version = await eimzo.init();
console.log(`E-IMZO ${version.major}.${version.minor}, API-ключ localhost принят`);

const keys = await eimzo.listKeys();
console.log(`Ключей: ${keys.length}`);
keys.forEach((k, i) =>
  console.log(
    `  [${i}] ${k.type} CN=${mask(k.CN)} TIN=${k.TIN ? 'есть' : '—'} PINFL=${k.PINFL ? 'есть' : '—'} ` +
      `O=${k.O ? 'есть' : '—'} до ${fmt(k.validTo)}${k.expired ? ' (ИСТЁК)' : ''}`,
  ),
);
console.log('Носители:', JSON.stringify(await eimzo.listDevices()));

await step(
  'sign с несуществующим keyId → KEY_NOT_FOUND',
  () => eimzo.sign('test', { keyId: 'ffffffffffffffffffffffffffffffffffffffff' }).then(() => 'НЕОЖИДАННО подписалось'),
  'KEY_NOT_FOUND',
);

if (interactive) await interactiveChecks();

async function interactiveChecks() {
  const key = keys[keyIndex];
  if (!key) throw new Error(`Нет ключа №${keyIndex}`);
  console.log(`\n--- Интерактивная проверка, ключ [${keyIndex}] ---`);

  await step('loadKey', () => eimzo.loadKey(key).then(() => 'keyId получен'));
  console.log('>>> Окно 1: нажмите «Отмена»');
  await step('sign (отмена)', () => eimzo.sign('test').then(() => 'подписано'), 'CANCELLED');
  console.log('>>> Окно 2: введите НЕВЕРНЫЙ пароль');
  await step('sign (неверный пароль)', () => eimzo.sign('test').then(() => 'подписано'), 'WRONG_PASSWORD');
  console.log('>>> Окно 3: введите ВЕРНЫЙ пароль');
  await step('sign (верный пароль)', () => eimzo.sign('test').then((p) => `PKCS#7 ${p.length} символов`));

  const oldKeyId = eimzo.keyId;
  await step('имитация «протухшего» keyId (pfx.unload_key напрямую)', () =>
    eimzo.call('pfx', 'unload_key', [oldKeyId]).then(() => 'выгружен'),
  );
  console.log('>>> Окно 4: введите ВЕРНЫЙ пароль (ключ загрузится заново автоматически)');
  await step('sign после потери keyId → автоперезагрузка', () =>
    eimzo.sign('test').then((p) => `PKCS#7 ${p.length} символов, keyId ${eimzo.keyId !== oldKeyId ? 'новый' : 'СТАРЫЙ'}`),
  );

  await step('unloadKey', () => eimzo.unloadKey().then(() => `keyId=${eimzo.keyId}`));
}
