import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
export default {
  // Пример лежит внутри репозитория библиотеки: не подхватывать её eslint-конфиг и package-lock.json.
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};
