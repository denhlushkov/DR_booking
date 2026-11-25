import type {
  BusySlot,
  CreateResourceRequest,
  Resource,
  ResourceSearchParams,
  ResourceStatus,
  StatusChangeResult,
} from '../types';
import { request } from './http';

export const resourcesApi = {
  /** FR-08, FR-09, FR-12 */
  search: (params: ResourceSearchParams = {}) => request<Resource[]>('/resources', { query: { ...params } }),

  /** FR-10: зайняті інтервали ресурсу */
  schedule: (id: string, from: string, to: string) =>
    request<BusySlot[]>(`/resources/${id}/schedule`, { query: { from, to } }),

  /** FR-06 (ADMIN) */
  create: (data: CreateResourceRequest) =>
    request<Resource>('/resources', { method: 'POST', body: JSON.stringify(data) }),

  /** FR-06 (ADMIN): обслуговування / блокування; майбутні бронювання скасовуються */
  changeStatus: (id: string, status: ResourceStatus) =>
    request<StatusChangeResult>(`/resources/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
