const API_BASE = '/api/v1';
const TOKEN_KEY = 'dr-booking.token';

/** Подія, яку слухає AuthContext, щоб розлогінити користувача при простроченому токені. */
export const UNAUTHORIZED_EVENT = 'dr-booking:unauthorized';

/** Сховище JWT. Обгорнуте в try/catch: localStorage може бути недоступним (приватний режим). */
export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | string[] | undefined>;

/** Єдина точка HTTP-взаємодії з API: базовий URL, JWT, обробка помилок. */
export async function request<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const { query, ...options } = init;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = tokenStorage.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}${toQueryString(query)}`, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && token) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `Помилка запиту (${response.status})`,
    );
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  return (contentType.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}

function toQueryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
