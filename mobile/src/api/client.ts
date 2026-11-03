import { getSecureToken, removeSecureToken } from '../utils/secureStorage';
import { router } from 'expo-router';

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.38:4000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// Global interceptor hooks
type ErrorHandler = (error: ApiError) => void;
let unauthorizedHandler: ErrorHandler | null = null;
let bannedHandler: ErrorHandler | null = null;
let maintenanceHandler: ErrorHandler | null = null;

export function setApiInterceptors(handlers: {
  onUnauthorized?: ErrorHandler;
  onBanned?: ErrorHandler;
  onMaintenance?: ErrorHandler;
}) {
  if (handlers.onUnauthorized) unauthorizedHandler = handlers.onUnauthorized;
  if (handlers.onBanned) bannedHandler = handlers.onBanned;
  if (handlers.onMaintenance) maintenanceHandler = handlers.onMaintenance;
}

export function resolveUrl(path?: string | null): string {
  if (!path) return '';
  const s = String(path);
  if (/^(https?:\/\/|data:|file:|content:)/i.test(s)) return s;
  return `${API_BASE_URL}/${s.replace(/^\/+/, '')}`;
}

export async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getSecureToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}/api${cleanPath}`;

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new ApiError(err?.message || 'Network connection failed', 0, 'network_error');
  }

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg = data?.error || (typeof data === 'string' ? data : `Request failed with ${res.status}`);
    const errorCode = data?.code || (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : undefined);
    const apiError = new ApiError(errorMsg, res.status, errorCode, data);

    // Global handling for security & status codes
    if (res.status === 401 || errorCode === 'unauthorized') {
      if (unauthorizedHandler) {
        unauthorizedHandler(apiError);
      } else {
        await removeSecureToken();
        try {
          router.replace('/(auth)/login');
        } catch {}
      }
    } else if (errorCode === 'banned' || (res.status === 403 && /banned/i.test(errorMsg))) {
      if (bannedHandler) bannedHandler(apiError);
      else {
        try {
          router.push('/modals/banned');
        } catch {}
      }
    } else if (errorCode === 'maintenance' || res.status === 503) {
      if (maintenanceHandler) maintenanceHandler(apiError);
      else {
        try {
          router.push('/modals/maintenance');
        } catch {}
      }
    }

    throw apiError;
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  del: <T = any>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),

  delete: <T = any>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),

  upload: <T = any>(path: string, formData: FormData, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: formData,
    }),
};

