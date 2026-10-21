import type { EimzoMessages } from '../errors';
import enJson from './en.json';
import kaaJson from './kaa.json';
import ruJson from './ru.json';
import uzCyrlJson from './uz-Cyrl.json';
import uzLatnJson from './uz-Latn.json';

// Тип `EimzoMessages` проверяет, что в каждом языке есть все ключи.
export const ru: EimzoMessages = ruJson;
export const en: EimzoMessages = enJson;
export const kaa: EimzoMessages = kaaJson;
export const uzLatn: EimzoMessages = uzLatnJson;
export const uzCyrl: EimzoMessages = uzCyrlJson;
