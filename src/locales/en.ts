import type { EimzoMessages } from '../errors';
import { formatSize } from './format';

const DOWNLOAD_URL = 'https://e-imzo.uz/main/downloads/';

export const en: EimzoMessages = {
  NOT_INSTALLED: () => 'Cannot connect to E-IMZO. Make sure the E-IMZO application is installed and running.',
  WEBSOCKET_UNSUPPORTED: () => 'Your browser does not support WebSocket. Please update your browser.',
  TIMEOUT: () => 'E-IMZO did not respond in time. Please try again.',
  OUTDATED_VERSION: (p) =>
    `An outdated version of E-IMZO is installed (${p.installed}). Install version ${p.min} or newer: ${DOWNLOAD_URL}`,
  API_KEY_REJECTED: () => 'E-IMZO rejected the API key for this site.',
  WRONG_PASSWORD: () => 'Wrong password.',
  CANCELLED: () => 'Operation cancelled.',
  KEY_NOT_FOUND: () => 'Key not found in E-IMZO. Please select the key again.',
  FILE_TOO_LARGE: (p) => `File is too large (${formatSize(p.size)}). Maximum is ${formatSize(p.max)}.`,
  KEY_NOT_LOADED: () => 'No key selected.',
  BACKEND_NOT_CONFIGURED: (p) => `Backend is not configured: missing methods ${p.methods}.`,
  BACKEND_ERROR: (p) =>
    p.detail ? `Server error: ${p.detail}` : p.status ? `Server error (HTTP ${p.status}).` : 'Server error.',
  EIMZO_ERROR: (p) => (p.reason ? `E-IMZO error: ${p.reason}` : 'Unknown E-IMZO error.'),
};
