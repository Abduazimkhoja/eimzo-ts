'use client';

import { useState } from 'react';
import { mode } from '../lib/eimzo';
import { useEimzo } from './useEimzo';

export function Signer() {
  const { keys, loaded, error, info, loadKey, sign, logout } = useEimzo();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('Тестовый документ');
  const [pkcs7, setPkcs7] = useState('');

  return (
    <>
      <h1>eimzo-ts — Next.js</h1>
      <p suppressHydrationWarning>
        {mode === 'mock'
          ? 'Режим mock: E-IMZO не нужен, ключи вымышленные. ?mode=real — настоящий E-IMZO.'
          : 'Режим real: нужен запущенный E-IMZO.'}
      </p>
      <p role="status" className={error ? 'error' : ''}>
        {error ?? info}
      </p>

      <select aria-label="Ключ" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
        {keys.map((k, i) => (
          <option key={k.serialNumber} value={i} disabled={k.expired}>
            {k.CN}
            {k.expired ? ' (срок истёк)' : ''}
          </option>
        ))}
      </select>
      <button disabled={!keys[index]} onClick={() => keys[index] && loadKey(keys[index])}>
        Загрузить ключ
      </button>
      <hr />
      <textarea aria-label="Текст для подписи" value={text} onChange={(e) => setText(e.target.value)} />
      <button disabled={!loaded} onClick={async () => setPkcs7((await sign(text)) ?? pkcs7)}>
        Подписать
      </button>
      <button disabled={!loaded} onClick={logout}>
        Выйти (выгрузить ключ)
      </button>
      <textarea aria-label="PKCS#7" readOnly value={pkcs7} placeholder="PKCS#7 (base64)" />
    </>
  );
}
