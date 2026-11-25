/** Подія «дані змінилися» (бронювання створено/змінено/скасовано) — оновлює сповіщення без очікування опитування. */
export const DATA_CHANGED_EVENT = 'dr-booking:data-changed';

export function emitDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}
