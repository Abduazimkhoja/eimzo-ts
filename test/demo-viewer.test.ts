// Просмотрщик PKCS#7 из демо: не входит в npm-пакет, но открыт на публичной странице.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Inspect = (base64: string) => unknown;

function loadViewer(): Inspect {
  const code = readFileSync(new URL('../demo/pkcs7-viewer.js', import.meta.url), 'utf8');
  const sandbox: { inspectPkcs7?: Inspect } = {};
  // Файл — классический скрипт `(function (global) { ... })(this)`.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(code).call(sandbox);
  return sandbox.inspectPkcs7!;
}

describe('demo/pkcs7-viewer.js', () => {
  const inspect = loadViewer();

  it.each([
    'MIAE', // неопределённая длина, у вложенного элемента нет длины — раньше бесконечный цикл
    'MIAwgA==', // вложенный элемент без маркера конца
    'MIIBAA==', // длина больше данных
    'MAMEBQA=', // вложенный элемент выходит за пределы родителя
    'MI////////8A', // длина в 7+ байтах
  ])('повреждённые данные %s — ошибка, а не зависание', (input) => {
    expect(() => inspect(input)).toThrow(Error);
  });
});
