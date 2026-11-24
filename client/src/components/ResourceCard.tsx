import type { Resource } from '../types';
import { RESOURCE_STATUS_LABELS, RESOURCE_TYPE_LABELS } from '../utils/labels';

interface Props {
  resource: Resource;
  onBook?: (resource: Resource) => void;
  busy?: boolean;
}

export function ResourceCard({ resource, onBook, busy }: Props) {
  const { zone, capacity, equipment } = resource.attributes;
  const available = resource.status === 'AVAILABLE';

  return (
    <article className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{resource.name}</h3>
          <p className="text-xs text-slate-500">
            {RESOURCE_TYPE_LABELS[resource.type]} · поверх {resource.floor}
            {zone ? ` · ${zone}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
        >
          {RESOURCE_STATUS_LABELS[resource.status]}
        </span>
      </div>

      <dl className="space-y-1 text-sm text-slate-600">
        {capacity !== undefined && (
          <div>
            <dt className="inline">Місткість: </dt>
            <dd className="inline">{capacity} осіб</dd>
          </div>
        )}
        {equipment && equipment.length > 0 && (
          <div>
            <dt className="inline">Обладнання: </dt>
            <dd className="inline">{equipment.join(', ')}</dd>
          </div>
        )}
      </dl>

      {onBook && (
        <button
          type="button"
          className="btn-primary mt-auto"
          disabled={!available || busy}
          onClick={() => onBook(resource)}
        >
          {busy ? 'Бронювання…' : 'Забронювати'}
        </button>
      )}
    </article>
  );
}
