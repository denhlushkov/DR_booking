import { useCallback, useEffect, useState } from 'react';
import { bookingsApi } from '../api/bookings.api';
import { ApiError } from '../api/http';
import { resourcesApi } from '../api/resources.api';
import { ResourceCalendar } from '../components/ResourceCalendar';
import { ResourceCard } from '../components/ResourceCard';
import { DEFAULT_SEARCH, ResourceFilters, type SearchFormValues } from '../components/ResourceFilters';
import type { Booking, Resource, ResourceSearchParams } from '../types';
import { emitDataChanged } from '../utils/events';
import { formatSlot } from '../utils/labels';
import { toIsoString, validateSlot } from '../utils/time';

type Message = { kind: 'success' | 'error'; text: string };

function toSearchParams(values: SearchFormValues): ResourceSearchParams {
  return {
    from: toIsoString(values.date, values.startTime),
    to: toIsoString(values.date, values.endTime),
    type: values.type || undefined,
    zone: values.zone.trim() || undefined,
    equipment: values.equipment
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    participants: values.participants ? Number(values.participants) : undefined,
  };
}

/** FR-08, FR-09, FR-12 — пошук вільних ресурсів; FR-03 — бронювання; FR-10 — календар. */
export function ResourcesPage() {
  const [form, setForm] = useState<SearchFormValues>(DEFAULT_SEARCH);
  const [params, setParams] = useState<ResourceSearchParams>(() => toSearchParams(DEFAULT_SEARCH));
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [calendarFor, setCalendarFor] = useState<Resource | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const load = useCallback(async (search: ResourceSearchParams) => {
    setLoading(true);
    try {
      setResources(await resourcesApi.search(search));
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof ApiError ? e.message : 'Не вдалося завантажити ресурси' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(params);
  }, [load, params]);

  const onSearch = (values: SearchFormValues) => {
    const next = toSearchParams(values);
    const slotError = validateSlot(next.from!, next.to!);
    if (slotError) {
      setMessage({ kind: 'error', text: slotError });
      return;
    }
    setMessage(null);
    setForm(values);
    setParams(next);
  };

  const showBooked = (resource: Resource, booking: Booking) => {
    setMessage({
      kind: 'success',
      text: `Заброньовано: ${resource.name}, ${formatSlot(booking.startTime, booking.endTime)}`,
    });
    void load(params);
  };

  const onBook = async (resource: Resource) => {
    const slotError = validateSlot(params.from!, params.to!);
    if (slotError) {
      setMessage({ kind: 'error', text: slotError });
      return;
    }
    setBookingId(resource.id);
    setMessage(null);
    try {
      const booking = await bookingsApi.create(resource.id, params.from!, params.to!);
      emitDataChanged();
      showBooked(resource, booking);
    } catch (e) {
      // 409 Conflict — хтось уже зайняв цей слот (FR-04).
      setMessage({ kind: 'error', text: e instanceof ApiError ? e.message : 'Не вдалося забронювати' });
    } finally {
      setBookingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Пошук вільних місць</h1>
      <ResourceFilters onSearch={onSearch} />

      {message && (
        <p
          role="status"
          className={`rounded-md p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Завантаження…</p>
      ) : resources.length === 0 ? (
        <p className="text-slate-500">Немає вільних ресурсів за обраними критеріями.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              onBook={onBook}
              onOpenCalendar={setCalendarFor}
              busy={bookingId === r.id}
            />
          ))}
        </div>
      )}

      {calendarFor && (
        <ResourceCalendar
          resource={calendarFor}
          date={form.date}
          onClose={() => setCalendarFor(null)}
          onBooked={(booking) => {
            showBooked(calendarFor, booking);
            setCalendarFor(null);
          }}
        />
      )}
    </section>
  );
}
