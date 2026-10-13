import type { EimzoMessages } from '../errors';
import { formatSize } from './format';

const DOWNLOAD_URL = 'https://e-imzo.uz/main/downloads/';

/** Ўзбекча (кирилл). */
export const uzCyrl: EimzoMessages = {
  NOT_INSTALLED: () =>
    'E-IMZO билан алоқа йўқ. E-IMZO дастури ўрнатилган ва ишга туширилганига ишонч ҳосил қилинг.',
  WEBSOCKET_UNSUPPORTED: () => 'Браузер WebSocket технологиясини қўллаб-қувватламайди. Браузерни янгиланг.',
  TIMEOUT: () => 'E-IMZO ўз вақтида жавоб бермади. Қайтадан уриниб кўринг.',
  OUTDATED_VERSION: (p) =>
    `E-IMZO дастурининг эскирган версияси ўрнатилган (${p.installed}). ${p.min} ёки ундан янги версияни ўрнатинг: ${DOWNLOAD_URL}`,
  API_KEY_REJECTED: () => 'E-IMZO ушбу сайт учун API-калитни рад этди.',
  WRONG_PASSWORD: () => 'Парол нотўғри.',
  CANCELLED: () => 'Амал бекор қилинди.',
  KEY_NOT_FOUND: () => 'Калит E-IMZO да топилмади. Калитни қайтадан танланг.',
  FILE_TOO_LARGE: (p) => `Файл жуда катта (${formatSize(p.size)}). Энг кўпи — ${formatSize(p.max)}.`,
  KEY_NOT_LOADED: () => 'Калит танланмаган.',
  BACKEND_NOT_CONFIGURED: (p) => `Backend созланмаган: ${p.methods} методлари йўқ.`,
  BACKEND_ERROR: (p) =>
    p.detail ? `Сервер хатоси: ${p.detail}` : p.status ? `Сервер хатоси (HTTP ${p.status}).` : 'Сервер хатоси.',
  EIMZO_ERROR: (p) => (p.reason ? `E-IMZO хатоси: ${p.reason}` : 'E-IMZO да номаълум хатолик.'),
};
