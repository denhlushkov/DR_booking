import type { ResourceStatus, ResourceType } from '../../domain/enums';
import type { Resource } from '../../domain/resource';

/** Фільтри, які ефективно виконуються на рівні сховища. */
export interface ResourceQuery {
  type?: ResourceType;
  floor?: number;
  zone?: string;
  status?: ResourceStatus;
}

export interface IResourceRepository {
  findById(id: string): Promise<Resource | null>;
  /**
   * Читає ресурс і блокує його рядок до кінця транзакції (SELECT ... FOR UPDATE).
   * Так паралельні бронювання одного ресурсу виконуються строго послідовно (FR-04).
   */
  findByIdForUpdate(id: string): Promise<Resource | null>;
  findAll(query?: ResourceQuery): Promise<Resource[]>;
  insert(resource: Resource): Promise<void>;
  update(resource: Resource): Promise<void>;
}
