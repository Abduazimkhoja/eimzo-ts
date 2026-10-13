import type { EimzoMessages } from '../errors';
import { formatSize } from './format';

const DOWNLOAD_URL = 'https://e-imzo.uz/main/downloads/';

/** Oʻzbekcha (lotin). */
export const uzLatn: EimzoMessages = {
  NOT_INSTALLED: () =>
    'E-IMZO bilan aloqa yoʻq. E-IMZO dasturi oʻrnatilgan va ishga tushirilganiga ishonch hosil qiling.',
  WEBSOCKET_UNSUPPORTED: () => 'Brauzer WebSocket texnologiyasini qoʻllab-quvvatlamaydi. Brauzerni yangilang.',
  TIMEOUT: () => 'E-IMZO oʻz vaqtida javob bermadi. Qaytadan urinib koʻring.',
  OUTDATED_VERSION: (p) =>
    `E-IMZO dasturining eskirgan versiyasi oʻrnatilgan (${p.installed}). ${p.min} yoki undan yangi versiyani oʻrnating: ${DOWNLOAD_URL}`,
  API_KEY_REJECTED: () => 'E-IMZO ushbu sayt uchun API-kalitni rad etdi.',
  WRONG_PASSWORD: () => 'Parol notoʻgʻri.',
  CANCELLED: () => 'Amal bekor qilindi.',
  KEY_NOT_FOUND: () => 'Kalit E-IMZO da topilmadi. Kalitni qaytadan tanlang.',
  FILE_TOO_LARGE: (p) => `Fayl juda katta (${formatSize(p.size)}). Eng koʻpi — ${formatSize(p.max)}.`,
  KEY_NOT_LOADED: () => 'Kalit tanlanmagan.',
  BACKEND_NOT_CONFIGURED: (p) => `Backend sozlanmagan: ${p.methods} metodlari yoʻq.`,
  BACKEND_ERROR: (p) =>
    p.detail ? `Server xatosi: ${p.detail}` : p.status ? `Server xatosi (HTTP ${p.status}).` : 'Server xatosi.',
  EIMZO_ERROR: (p) => (p.reason ? `E-IMZO xatosi: ${p.reason}` : 'E-IMZO da nomaʼlum xatolik.'),
};
