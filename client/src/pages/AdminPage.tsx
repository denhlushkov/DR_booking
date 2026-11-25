import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { analyticsApi } from '../api/analytics.api';
import { ApiError } from '../api/http';
import { resourcesApi } from '../api/resources.api';
import { usersApi } from '../api/users.api';
import type { CreateUserRequest, Resource, ResourceStatus, ResourceType, UserProfile } from '../types';
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

type Message = { kind: 'success' | 'error'; text: string };

const STATUSES = Object.keys(RESOURCE_STATUS_LABELS) as ResourceStatus[];

/** Панель адміністратора: FR-06 (ресурси), FR-07 (CSV-звіт), FR-13 (користувачі). */
export function AdminPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const resourceForm = useForm<NewResourceForm>({ defaultValues: { type: 'DESK', floor: 1 } });
  const userForm = useForm<CreateUserRequest>({ defaultValues: { role: 'EMPLOYEE' } });
  const reportForm = useForm<ReportForm>({ defaultValues: { from: todayInputValue(), to: todayInputValue() } });

  const run = useCallback(async (action: () => Promise<string | void>) => {
    setMessage(null);
    try {
      const success = await action();
      if (success) setMessage({ kind: 'success', text: success });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof ApiError ? e.message : 'Операція не вдалася' });
    }
  }, []);

  const load = useCallback(
    () =>
      run(async () => {
        const [r, u] = await Promise.all([resourcesApi.search(), usersApi.list()]);
        setResources(r);
        setUsers(u);
      }),
    [run],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const onCreateResource = (v: NewResourceForm) =>
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
      return `Ресурс «${v.name}» додано`;
    });

  const onStatusChange = (resource: Resource, status: ResourceStatus) =>
    run(async () => {
      const { cancelledBookings } = await resourcesApi.changeStatus(resource.id, status);
      await load();
      return (
        `«${resource.name}»: ${RESOURCE_STATUS_LABELS[status].toLowerCase()}` +
        (cancelledBookings ? `. Скасовано бронювань: ${cancelledBookings}, власників сповіщено` : '')
      );
    });

  const onCreateUser = (v: CreateUserRequest) =>
    run(async () => {
      const user = await usersApi.create(v);
      userForm.reset({ role: 'EMPLOYEE' } as CreateUserRequest);
      await load();
      return `Обліковий запис ${user.email} створено`;
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
      {message && (
        <p
          role="status"
          className={`rounded-md p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={resourceForm.handleSubmit(onCreateResource)} className="card space-y-3">
          <h2 className="font-semibold">Новий ресурс</h2>
          <input className="input" placeholder="Назва" {...resourceForm.register('name', { required: true })} />
          <div className="grid grid-cols-2 gap-3">
            <select className="input" aria-label="Тип ресурсу" {...resourceForm.register('type')}>
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
          <p className="text-xs text-slate-500">
            Рахується в робочі години (Пн–Пт 08:00–20:00), без часу обслуговування та блокування.
          </p>
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
        <h2 className="mb-2 font-semibold">Ресурси</h2>
        <table className="w-full min-w-[32rem] text-left text-sm">
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
                    aria-label={`Статус ${r.name}`}
                    value={r.status}
                    onChange={(e) => onStatusChange(r, e.target.value as ResourceStatus)}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={userForm.handleSubmit(onCreateUser)} className="card space-y-3" noValidate>
          <h2 className="font-semibold">Новий користувач</h2>
          <input className="input" placeholder="ПІБ" {...userForm.register('fullName', { required: true, minLength: 2 })} />
          <input type="email" className="input" placeholder="Корпоративна пошта" {...userForm.register('email', { required: true })} />
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="Початковий пароль (від 8 символів)"
            {...userForm.register('password', { required: true, minLength: 8 })}
          />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Відділ" {...userForm.register('department', { required: true })} />
            <input className="input" placeholder="Посада" {...userForm.register('position', { required: true })} />
          </div>
          <select className="input" aria-label="Роль" {...userForm.register('role')}>
            <option value="EMPLOYEE">Співробітник</option>
            <option value="ADMIN">Адміністратор</option>
          </select>
          {Object.keys(userForm.formState.errors).length > 0 && (
            <p className="text-xs text-red-600">Заповніть усі поля; пароль — щонайменше 8 символів.</p>
          )}
          <button type="submit" className="btn-primary">
            Створити
          </button>
        </form>

        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Користувачі ({users.length})</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {users.map((u) => (
              <li key={u.id} className="py-2">
                <p className="font-medium">
                  {u.fullName} {u.role === 'ADMIN' && <span className="text-xs text-indigo-700">· адміністратор</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {u.email} · {u.position}, {u.department}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
