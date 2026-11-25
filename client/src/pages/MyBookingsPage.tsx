import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { bookingsApi } from '../api/bookings.api';
import { ApiError } from '../api/http';
import { resourcesApi } from '../api/resources.api';
import { useAuth } from '../context/AuthContext';
import type { Booking, BookingStatus, Resource } from '../types';
import { emitDataChanged } from '../utils/events';
import { BOOKING_STATUS_LABELS, formatSlot } from '../utils/labels';
import { CANCELLATION_CUTOFF_MINUTES, canCancel, toIsoString, todayInputValue, validateSlot } from '../utils/time';

const STATUS_STYLES: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-50 text-red-700',
};

type Filter = 'active' | 'history';

/** FR-02 — особистий кабінет; FR-05 — скасування; перенесення власних бронювань. */
export function MyBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, all] = await Promise.all([bookingsApi.mine(), resourcesApi.search()]);
      setBookings(mine);
      setResources(all);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалося завантажити бронювання');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resourceNames = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);
  const visible = bookings.filter((b) => (filter === 'active' ? b.status === 'CONFIRMED' : b.status !== 'CONFIRMED'));

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      emitDataChanged();
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Операція не вдалася');
    }
  };

  return (
    <section className="space-y-4">
      <div className="card">
        <h1 className="text-2xl font-semibold">{user?.fullName}</h1>
        <p className="text-sm text-slate-500">
          {user?.position} · {user?.department} · {user?.email}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Мої бронювання</h2>
        <div className="flex gap-1" role="tablist">
          {(['active', 'history'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={filter === f ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setFilter(f)}
            >
              {f === 'active' ? 'Активні' : 'Завершені та скасовані'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-slate-500">{filter === 'active' ? 'Активних бронювань немає.' : 'Історія порожня.'}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((b) => (
            <li key={b.id} className="card space-y-3" data-testid="booking-item">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{resourceNames.get(b.resourceId) ?? 'Ресурс'}</p>
                  <p className="text-sm text-slate-600">{formatSlot(b.startTime, b.endTime)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[b.status]}`}>
                    {BOOKING_STATUS_LABELS[b.status]}
                  </span>
                  {b.status === 'CONFIRMED' && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!canCancel(b)}
                        onClick={() => setEditing(editing === b.id ? null : b.id)}
                      >
                        Змінити час
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={!canCancel(b)}
                        title={canCancel(b) ? '' : `Можливо не пізніше ніж за ${CANCELLATION_CUTOFF_MINUTES} хв до початку`}
                        onClick={() => run(() => bookingsApi.cancel(b.id))}
                      >
                        Скасувати
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing === b.id && (
                <RescheduleForm
                  booking={b}
                  onCancel={() => setEditing(null)}
                  onSubmit={(start, end) => run(() => bookingsApi.reschedule(b.id, start, end))}
                  onInvalid={setError}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface RescheduleValues {
  date: string;
  startTime: string;
  endTime: string;
}

function RescheduleForm({
  booking,
  onSubmit,
  onCancel,
  onInvalid,
}: {
  booking: Booking;
  onSubmit: (startIso: string, endIso: string) => Promise<void>;
  onCancel: () => void;
  onInvalid: (message: string) => void;
}) {
  const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  const { register, handleSubmit, formState } = useForm<RescheduleValues>({
    defaultValues: {
      date: todayInputValue(new Date(booking.startTime)),
      startTime: hhmm(booking.startTime),
      endTime: hhmm(booking.endTime),
    },
  });

  const submit = async (v: RescheduleValues) => {
    const start = toIsoString(v.date, v.startTime);
    const end = toIsoString(v.date, v.endTime);
    const invalid = validateSlot(start, end);
    if (invalid) return onInvalid(invalid);
    await onSubmit(start, end);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
      <input type="date" className="input" aria-label="Нова дата" {...register('date', { required: true })} />
      <input type="time" step={1800} className="input" aria-label="Новий початок" {...register('startTime', { required: true })} />
      <input type="time" step={1800} className="input" aria-label="Нове завершення" {...register('endTime', { required: true })} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={formState.isSubmitting}>
          Зберегти
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ✕
        </button>
      </div>
    </form>
  );
}
