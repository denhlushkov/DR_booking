import type { LoginResponse, UserProfile } from '../types';
import { request } from './http';

export const authApi = {
  /** FR-01 */
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  /** FR-02 */
  me: () => request<UserProfile>('/users/me'),
};
