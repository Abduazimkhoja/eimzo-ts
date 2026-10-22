import { Injectable, signal } from '@angular/core';
import type { EimzoKey } from 'eimzo-ts';
import { eimzo, errorText } from './eimzo';

/**
 * Обёртка над единственным экземпляром Eimzo (см. eimzo.ts) с состоянием в сигналах.
 * Для SSR (@angular/ssr) вызывайте init() из afterNextRender(), а не из конструктора.
 */
@Injectable({ providedIn: 'root' })
export class EimzoService {
  readonly keys = signal<EimzoKey[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal('');

  private async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    this.error.set(null);
    try {
      return await fn();
    } catch (e) {
      this.error.set(errorText(e)); // CANCELLED -> null: пользователь передумал
      return undefined;
    }
  }

  init() {
    return this.run(async () => {
      const v = await eimzo.init();
      this.info.set(`E-IMZO ${v.major}.${v.minor} подключён.`);
      this.keys.set(await eimzo.listKeys());
    });
  }

  loadKey(key: EimzoKey) {
    return this.run(async () => {
      await eimzo.loadKey(key);
      this.loaded.set(true);
    });
  }

  sign(text: string) {
    return this.run(() => eimzo.sign(text));
  }

  async logout() {
    await eimzo.unloadKey();
    this.loaded.set(false);
  }
}
