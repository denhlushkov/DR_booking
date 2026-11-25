import type { CreateUserRequest, UserProfile } from '../types';
import { request } from './http';

/** Керування обліковими записами (ADMIN). */
export const usersApi = {
  list: () => request<UserProfile[]>('/users'),
  /** FR-13 */
  create: (data: CreateUserRequest) =>
    request<UserProfile>('/users', { method: 'POST', body: JSON.stringify(data) }),
};
