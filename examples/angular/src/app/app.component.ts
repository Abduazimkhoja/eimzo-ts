import { Component, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { mode } from './eimzo';
import { EimzoService } from './eimzo.service';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  template: `
    <h1>eimzo-ts — Angular</h1>
    <p>
      {{
        mode === 'mock'
          ? 'Режим mock: E-IMZO не нужен, ключи вымышленные. ?mode=real — настоящий E-IMZO.'
          : 'Режим real: нужен запущенный E-IMZO.'
      }}
    </p>
    <p role="status" [class.error]="svc.error()">{{ svc.error() ?? svc.info() }}</p>

    <select [(ngModel)]="index" aria-label="Ключ">
      @for (k of svc.keys(); track k.serialNumber; let i = $index) {
        <option [ngValue]="i" [disabled]="k.expired">{{ k.CN }}{{ k.expired ? ' (срок истёк)' : '' }}</option>
      }
    </select>
    <button [disabled]="!svc.keys()[index]" (click)="load()">Загрузить ключ</button>
    <hr />
    <textarea [(ngModel)]="text" aria-label="Текст для подписи"></textarea>
    <button [disabled]="!svc.loaded()" (click)="sign()">Подписать</button>
    <button [disabled]="!svc.loaded()" (click)="svc.logout()">Выйти (выгрузить ключ)</button>
    <textarea [value]="pkcs7()" aria-label="PKCS#7" readonly placeholder="PKCS#7 (base64)"></textarea>
  `,
})
export class AppComponent {
  protected readonly svc = inject(EimzoService);
  protected readonly mode = mode;
  protected index = 0;
  protected text = 'Тестовый документ';
  protected readonly pkcs7 = signal('');

  constructor() {
    // afterNextRender выполняется только в браузере — E-IMZO на сервере не вызывается.
    afterNextRender(() => void this.svc.init());
  }

  protected load() {
    const key = this.svc.keys()[this.index];
    if (key) void this.svc.loadKey(key);
  }

  protected async sign() {
    const result = await this.svc.sign(this.text);
    if (result) this.pkcs7.set(result);
  }
}
