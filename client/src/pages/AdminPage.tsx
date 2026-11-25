import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { analyticsApi } from '../api/analytics.api';
import { ApiError } from '../api/http';
import { resourcesApi } from '../api/resources.api';
import type { Resource, ResourceStatus, ResourceType } from '../types';
import { RESOURCE_STATUS_LABELS, RESOURCE_TYPE_LABELS } from '../utils/labels';
import { toIsoString, todayInputValue } from '../utils/time';

interface NewResourceForm {
  name: string;
  type: ResourceType;
  floor: number;
  zone: string;
  capacity: string;
  equipment: string;
}

interface ReportForm {
  from: string;
  to: string;
}

const STATUSES = Object.keys(RESOURCE_STATUS_LABELS) as ResourceStatus[];

/** Панель адміністратора: FR-06 (ресурси) та FR-07 (CSV-звіт). */
export function AdminPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const resourceForm = useForm<NewResourceForm>({ defaultValues: { type: 'DESK', floor: 1 } });
  const reportForm = useForm<ReportForm>({ defaultValues: { from: todayInputValue(), to: todayInputValue() } });

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Операція не вдалася');
    }
  }, []);

  const load = useCallback(() => run(async () => setResources(await resourcesApi.search())), [run]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = (v: NewResourceForm) =>
    run(async () => {
      await resourcesApi.create({
        name: v.name,
        type: v.type,
        floor: Number(v.floor),
        attributes: {
          zone: v.zone.trim() || undefined,
          capacity: v.type === 'MEETING_ROOM' && v.capacity ? Number(v.capacity) : undefined,
          equipment: v.equipment.split(',').map((s) => s.trim()).filter(Boolean),
        },
      });
      resourceForm.reset();
      await load();
    });

  const onStatusChange = (id: string, status: ResourceStatus) =>
    run(async () => {
      await resourcesApi.changeStatus(id, status);
      await load();
    });

  const onExport = ({ from, to }: ReportForm) =>
    run(async () => {
      const end = new Date(toIsoString(to, '00:00'));
      end.setDate(end.getDate() + 1); // включно з останнім днем
      await analyticsApi.downloadUtilizationCsv(toIsoString(from, '00:00'), end.toISOString());
    });

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Адміністрування</h1>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={resourceForm.handleSubmit(onCreate)} className="card space-y-3">
          <h2 className="font-semibold">Новий ресурс</h2>
          <input className="input" placeholder="Назва" {...resourceForm.register('name', { required: true })} />
          <div className="grid grid-cols-2 gap-3">
            <select className="input" {...resourceForm.register('type')}>
              <option value="DESK">{RESOURCE_TYPE_LABELS.DESK}</option>
              <option value="MEETING_ROOM">{RESOURCE_TYPE_LABELS.MEETING_ROOM}</option>
            </select>
            <input type="number" className="input" placeholder="Поверх" {...resourceForm.register('floor')} />
            <input className="input" placeholder="Зона" {...resourceForm.register('zone')} />
            <input type="number" min={1} className="input" placeholder="Місткість" {...resourceForm.register('capacity')} />
          </div>
          <input className="input" placeholder="Обладнання через кому" {...resourceForm.register('equipment')} />
          <button type="submit" className="btn-primary">
            Додати
          </button>
        </form>

        <form onSubmit={reportForm.handleSubmit(onExport)} className="card space-y-3">
          <h2 className="font-semibold">Звіт завантаженості (CSV)</h2>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">З</span>
              <input type="date" className="input" {...reportForm.register('from', { required: true })} />
            </label>
            <label>
              <span className="label">По (включно)</span>
              <input type="date" className="input" {...reportForm.register('to', { required: true })} />
            </label>
          </div>
          <button type="submit" className="btn-secondary">
            Завантажити CSV
          </button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2">Назва</th>
              <th>Тип</th>
              <th>Поверх</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">{r.name}</td>
                <td>{RESOURCE_TYPE_LABELS[r.type]}</td>
                <td>{r.floor}</td>
                <td>
                  <select
                    className="input py-1"
                    value={r.status}
                    onChange={(e) => onStatusChange(r.id, e.target.value as ResourceStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {RESOURCE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
