const cache = new Map<string, { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>();

function formatters(timeZone: string) {
  let entry = cache.get(timeZone);
  if (!entry) {
    entry = {
      date: new Intl.DateTimeFormat('uk-UA', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: new Intl.DateTimeFormat('uk-UA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
    cache.set(timeZone, entry);
  }
  return entry;
}

/** «01.12.2026, 10:00–11:00» у часовому поясі офісу. */
export function formatSlot(start: Date, end: Date, timeZone: string): string {
  const f = formatters(timeZone);
  return `${f.date.format(start)}, ${f.time.format(start)}–${f.time.format(end)}`;
}
