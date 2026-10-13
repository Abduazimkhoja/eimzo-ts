/** Общий параметр методов, которые можно отменить. */
export interface EimzoCallOptions {
  /**
   * Отмена ожидания: Promise отклоняется с `signal.reason` (по умолчанию `AbortError`), как `fetch`.
   * Окно пароля, уже открытое E-IMZO, отмена не закрывает.
   */
  signal?: AbortSignal;
}

/** Причина отмены; `signal.reason` есть не во всех браузерах. */
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

/** Отклоняет `promise` при отмене `signal`; сама операция продолжается. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
