import type { CreateResourceRequest, Resource, ResourceSearchParams, ResourceStatus } from '../types';
import { request } from './http';

export const resourcesApi = {
  /** FR-08, FR-09, FR-12 */
  search: (params: ResourceSearchParams = {}) => request<Resource[]>('/resources', { query: { ...params } }),

  /** FR-06 (ADMIN) */
  create: (data: CreateResourceRequest) =>
    request<Resource>('/resources', { method: 'POST', body: JSON.stringify(data) }),

  /** FR-06 (ADMIN): обслуговування / блокування */
  changeStatus: (id: string, status: ResourceStatus) =>
    request<Resource>(`/resources/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
