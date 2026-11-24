import { useCallback, useEffect, useMemo, useState } from 'react';
import { bookingsApi } from '../api/bookings.api';
import { ApiError } from '../api/http';
import { resourcesApi } from '../api/resources.api';
import { useAuth } from '../context/AuthContext';
import type { Booking, Resource } from '../types';
import { BOOKING_STATUS_LABELS, formatSlot } from '../utils/labels';
import { CANCELLATION_CUTOFF_MINUTES, canCancel } from '../utils/time';

/** FR-02 — особистий кабінет; FR-05 — скасування власних бронювань. */
export function MyBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
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

  const onCancel = async (booking: Booking) => {
    setError(null);
    try {
      await bookingsApi.cancel(booking.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалося скасувати бронювання');
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

      <h2 className="text-lg font-semibold">Мої бронювання</h2>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {bookings.length === 0 ? (
        <p className="text-slate-500">У вас ще немає бронювань.</p>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{resourceNames.get(b.resourceId) ?? 'Ресурс'}</p>
                <p className="text-sm text-slate-600">{formatSlot(b.startTime, b.endTime)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{BOOKING_STATUS_LABELS[b.status]}</span>
                {b.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={!canCancel(b)}
                    title={canCancel(b) ? '' : `Скасування можливе не пізніше ніж за ${CANCELLATION_CUTOFF_MINUTES} хв`}
                    onClick={() => onCancel(b)}
                  >
                    Скасувати
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
