import type { EimzoMessages } from '../errors';
import { formatSize } from './format';

const DOWNLOAD_URL = 'https://e-imzo.uz/main/downloads/';

export const ru: EimzoMessages = {
  NOT_INSTALLED: () => 'Нет соединения с E-IMZO. Убедитесь, что приложение E-IMZO установлено и запущено.',
  WEBSOCKET_UNSUPPORTED: () => 'Браузер не поддерживает WebSocket. Обновите браузер.',
  TIMEOUT: () => 'E-IMZO не ответил вовремя. Попробуйте ещё раз.',
  OUTDATED_VERSION: (p) =>
    `Установлена устаревшая версия E-IMZO (${p.installed}). Установите версию ${p.min} или новее: ${DOWNLOAD_URL}`,
  API_KEY_REJECTED: () => 'E-IMZO отклонил API-ключ для этого сайта.',
  WRONG_PASSWORD: () => 'Неверный пароль.',
  CANCELLED: () => 'Операция отменена.',
  KEY_NOT_FOUND: () => 'Ключ не найден в E-IMZO. Выберите ключ заново.',
  FILE_TOO_LARGE: (p) => `Файл слишком большой (${formatSize(p.size)}). Максимум — ${formatSize(p.max)}.`,
  KEY_NOT_LOADED: () => 'Ключ не выбран.',
  BACKEND_NOT_CONFIGURED: (p) => `Backend не настроен: нет методов ${p.methods}.`,
  BACKEND_ERROR: (p) =>
    p.detail ? `Ошибка сервера: ${p.detail}` : p.status ? `Ошибка сервера (HTTP ${p.status}).` : 'Ошибка сервера.',
  EIMZO_ERROR: (p) => (p.reason ? `Ошибка E-IMZO: ${p.reason}` : 'Неизвестная ошибка E-IMZO.'),
};
