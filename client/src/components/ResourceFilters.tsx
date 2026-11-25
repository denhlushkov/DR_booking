import { useForm } from 'react-hook-form';
import type { ResourceType } from '../types';
import { nextSlotDefaults } from '../utils/time';

/** Значення форми пошуку (FR-09, FR-12). */
export interface SearchFormValues {
  date: string;
  startTime: string;
  endTime: string;
  type: ResourceType | '';
  zone: string;
  equipment: string;
  participants: string;
}

export const DEFAULT_SEARCH: SearchFormValues = {
  ...nextSlotDefaults(),
  type: '',
  zone: '',
  equipment: '',
  participants: '',
};

interface Props {
  defaultValues?: SearchFormValues;
  onSearch: (values: SearchFormValues) => void;
}

export function ResourceFilters({ defaultValues = DEFAULT_SEARCH, onSearch }: Props) {
  const { register, handleSubmit, watch } = useForm<SearchFormValues>({ defaultValues });
  const isRoom = watch('type') === 'MEETING_ROOM';

  return (
    <form onSubmit={handleSubmit(onSearch)} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label>
        <span className="label">Дата</span>
        <input type="date" className="input" {...register('date', { required: true })} />
      </label>
      <label>
        <span className="label">Початок</span>
        <input type="time" step={1800} className="input" {...register('startTime', { required: true })} />
      </label>
      <label>
        <span className="label">Завершення</span>
        <input type="time" step={1800} className="input" {...register('endTime', { required: true })} />
      </label>
      <label>
        <span className="label">Тип ресурсу</span>
        <select className="input" {...register('type')}>
          <option value="">Усі</option>
          <option value="DESK">Робоче місце</option>
          <option value="MEETING_ROOM">Переговорна кімната</option>
        </select>
      </label>
      <label>
        <span className="label">Зона офісу</span>
        <input className="input" placeholder="напр. Open Space A" {...register('zone')} />
      </label>
      <label>
        <span className="label">Обладнання (через кому)</span>
        <input className="input" placeholder="monitor, docking" {...register('equipment')} />
      </label>
      <label>
        <span className="label">Кількість учасників</span>
        <input
          type="number"
          min={1}
          className="input"
          disabled={!isRoom}
          placeholder={isRoom ? '' : 'лише для кімнат'}
          {...register('participants')}
        />
      </label>
      <div className="flex items-end">
        <button type="submit" className="btn-primary w-full">
          Знайти вільні
        </button>
      </div>
    </form>
  );
}
