import type { EimzoRequest, EimzoResponse, Transport } from '../src';

type Handler = (req: EimzoRequest) => EimzoResponse | Promise<EimzoResponse>;

/** Транспорт-заглушка: ответы по ключу `plugin.name` (или `name` для version/apikey). */
export function fakeTransport(handlers: Record<string, Handler | EimzoResponse>) {
  const calls: EimzoRequest[] = [];
  const transport: Transport = async (req) => {
    calls.push(req);
    const key = req.plugin ? `${req.plugin}.${req.name}` : req.name;
    const handler = handlers[key];
    if (!handler) return { success: false, reason: `no handler for ${key}` };
    return typeof handler === 'function' ? handler(req) : handler;
  };
  return { transport, calls };
}

export const VERSION_486 = { success: true, major: '4', minor: '86' };

export const PFX_ALIAS =
  'cn=ivanov ivan,name=ivan,surname=ivanov,o=ooo "romashka, llc",t=director,c=uz,uid=123456789,' +
  '1.2.860.3.16.1.2=31234567890123,serialnumber=7826a1b,validfrom=2024.01.10 10:00:00,validto=2099.01.10 23:59:59';
