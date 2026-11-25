import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../api/notifications.api';
import type { Inbox } from '../types';
import { DATA_CHANGED_EVENT } from '../utils/events';

const POLL_INTERVAL_MS = 30_000;
const timeFormat = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** FR-11: сповіщення про бронювання та нагадування в шапці застосунку. */
export function NotificationBell() {
  const [inbox, setInbox] = useState<Inbox>({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setInbox(await notificationsApi.inbox());
    } catch {
      /* мережеві збої не блокують інтерфейс — повторимо при наступному опитуванні */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    const onChange = () => void load();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    await load();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="btn-secondary relative px-3"
        aria-label={`Сповіщення, непрочитаних: ${inbox.unreadCount}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
        {inbox.unreadCount > 0 && (
          <span data-testid="unread-count" className="absolute -top-1 -right-1 min-w-5 rounded-full bg-red-600 px-1 text-xs text-white">
            {inbox.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Сповіщення"
          className="card fixed inset-x-4 top-16 z-20 max-h-[70vh] overflow-y-auto p-0 sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-sm font-semibold">Сповіщення</span>
            {inbox.unreadCount > 0 && (
              <button type="button" className="text-xs text-indigo-700 hover:underline" onClick={markAllRead}>
                Позначити всі прочитаними
              </button>
            )}
          </div>
          {inbox.items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Сповіщень поки немає.</p>
          ) : (
            <ul>
              {inbox.items.map((n) => (
                <li key={n.id} className={`border-b border-slate-100 px-4 py-3 last:border-0 ${n.readAt ? '' : 'bg-indigo-50/60'}`}>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-sm text-slate-600">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{timeFormat.format(new Date(n.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
