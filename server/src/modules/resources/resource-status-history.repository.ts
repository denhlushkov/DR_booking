import type { ResourceStatus } from '../../domain/enums';
import type { TimeRange } from '../../shared/time-range';

/** Період, коли ресурс був недоступний (MAINTENANCE / BLOCKED). */
export interface ResourceDowntime {
  resourceId: string;
  status: ResourceStatus;
  startedAt: Date;
  /** null — простій триває досі. */
  endedAt: Date | null;
}

/** Історія недоступності ресурсів — потрібна для точного розрахунку завантаженості (FR-07). */
export interface IResourceStatusHistoryRepository {
  /** Закриває відкритий період простою ресурсу (якщо він є). */
  closeOpen(resourceId: string, at: Date): Promise<void>;
  /** Відкриває новий період простою. */
  open(id: string, resourceId: string, status: ResourceStatus, at: Date): Promise<void>;
  /** Періоди простою, що перетинаються з інтервалом. */
  findOverlapping(period: TimeRange): Promise<ResourceDowntime[]>;
}
