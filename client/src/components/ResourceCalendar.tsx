import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { bookingsApi } from '../api/bookings.api';
import { ApiError } from '../api/http';
import { resourcesApi } from '../api/resources.api';
import type { Booking, BusySlot, Resource } from '../types';
import { emitDataChanged } from '../utils/events';
import { buildDaySlots, dayBounds } from '../utils/slots';

interface Props {
  resource: Resource;
  date: string;
  onClose: () => void;
  onBooked: (booking: Booking) => void;
}

const DURATIONS = [30, 60, 90, 120, 180, 240];
const timeFormat = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });

/** FR-10: календар доступності ресурсу на день з вибором вільного слота. */
export function ResourceCalendar({ resource, date: initialDate, onClose, onBooked }: Props) {
  const titleId = useId();
  const [date, setDate] = useState(initialDate);
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = dayBounds(date);
      setBusy(await resourcesApi.schedule(resource.id, from, to));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалося завантажити розклад');
    } finally {
      setLoading(false);
    }
  }, [date, resource.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const slots = useMemo(() => buildDaySlots(date, busy, { durationMinutes: duration }), [date, busy, duration]);

  const book = async (start: Date, end: Date) => {
    setSubmitting(true);
    setError(null);
    try {
      const booking = await bookingsApi.create(resource.id, start.toISOString(), end.toISOString());
      emitDataChanged();
      onBooked(booking);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалося забронювати');
      await load(); // слот могли зайняти щойно — оновлюємо сітку
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {resource.name}
            </h2>
            <p className="text-xs text-slate-500">Оберіть вільний час початку</p>
          </div>
          <button type="button" className="btn-secondary px-3" onClick={onClose} aria-label="Закрити">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Дата</span>
            <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <label>
            <span className="label">Тривалість</span>
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d < 60 ? `${d} хв` : `${d / 60} год`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження розкладу…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="slot-grid">
              {slots.map((slot) => (
                <button
                  key={slot.start.toISOString()}
                  type="button"
                  disabled={!slot.free || submitting}
                  onClick={() => book(slot.start, slot.end)}
                  className={`rounded-md border px-2 py-2 text-sm ${
                    slot.free
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through'
                  }`}
                  aria-label={`${timeFormat.format(slot.start)}–${timeFormat.format(slot.end)} ${slot.free ? 'вільно' : 'зайнято'}`}
                >
                  {timeFormat.format(slot.start)}
                </button>
              ))}
            </div>
            {busy.length > 0 && (
              <p className="text-xs text-slate-500">
                Зайнято: {busy.map((b) => `${timeFormat.format(new Date(b.startTime))}–${timeFormat.format(new Date(b.endTime))}`).join(', ')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
