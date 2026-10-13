import type { EimzoMessages } from '../errors';
import { formatSize } from './format';

const DOWNLOAD_URL = 'https://e-imzo.uz/main/downloads/';

/** Qaraqalpaqsha (latın). */
export const kaa: EimzoMessages = {
  NOT_INSTALLED: () =>
    'E-IMZO menen baylanıs joq. E-IMZO baǵdarlaması ornatılǵanın hám iske túsirilgenin tekseriń.',
  WEBSOCKET_UNSUPPORTED: () => 'Brauzer WebSocket texnologiyasın qollap-quwatlamaydı. Brauzerdi jańalań.',
  TIMEOUT: () => 'E-IMZO óz waqtında juwap bermedi. Qaytadan urınıp kóriń.',
  OUTDATED_VERSION: (p) =>
    `E-IMZO baǵdarlamasınıń eski versiyası ornatılǵan (${p.installed}). ${p.min} yamasa onnan jańa versiyanı ornatıń: ${DOWNLOAD_URL}`,
  API_KEY_REJECTED: () => 'E-IMZO usı sayt ushın API-giltti qabıl etpedi.',
  WRONG_PASSWORD: () => 'Parol qáte.',
  CANCELLED: () => 'Ámel biykar etildi.',
  KEY_NOT_FOUND: () => 'Gilt E-IMZO-da tabılmadı. Giltti qaytadan tańlań.',
  FILE_TOO_LARGE: (p) => `Fayl júdá úlken (${formatSize(p.size)}). Eń kóbi — ${formatSize(p.max)}.`,
  KEY_NOT_LOADED: () => 'Gilt tańlanbaǵan.',
  BACKEND_NOT_CONFIGURED: (p) => `Backend sazlanbaǵan: ${p.methods} metodları joq.`,
  BACKEND_ERROR: (p) =>
    p.detail ? `Server qátesi: ${p.detail}` : p.status ? `Server qátesi (HTTP ${p.status}).` : 'Server qátesi.',
  EIMZO_ERROR: (p) => (p.reason ? `E-IMZO qátesi: ${p.reason}` : 'E-IMZO-da belgisiz qátelik.'),
};
