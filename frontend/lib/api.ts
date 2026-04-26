interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const DEFAULT_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, ...fetchOptions } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 5xx errors or timeout
      if (response.status >= 500 && attempt < retries) {
        await sleep(RETRY_DELAY * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error occurred');

      // Don't retry on client errors (4xx)
      if (attempt < retries) {
        await sleep(RETRY_DELAY * (attempt + 1));
      }
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}

export async function apiGet<T>(url: string, token?: string): Promise<T> {
  const response = await apiFetch(url, {
    method: 'GET',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (response.status === 401) {
    // Token expired or invalid - clear session
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    throw new Error('Session expired. Redirecting to login...');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

export async function apiPost<T>(url: string, data: unknown, token?: string): Promise<T> {
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
    // Token expired or invalid - clear session
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    throw new Error('Session expired. Redirecting to login...');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

export async function apiPut<T>(url: string, data: unknown, token?: string): Promise<T> {
  const response = await apiFetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
    // Token expired or invalid - clear session
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    throw new Error('Session expired. Redirecting to login...');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

export async function apiDelete(url: string, token?: string): Promise<void> {
  const response = await apiFetch(url, {
    method: 'DELETE',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (response.status === 401) {
    // Token expired or invalid - clear session
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    throw new Error('Session expired. Redirecting to login...');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return 'An unexpected error occurred';
}

interface AuthResponse {
  data: {
    token: string;
    user: {
      id: string;
      email: string;
      name: string;
      phone?: string | null;
    };
  };
}

export const authAPI = {
  async register(
    email: string,
    password: string,
    name: string,
    phone?: string,
  ): Promise<AuthResponse> {
    const response = await apiPost<AuthResponse['data']>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/register`,
      { email, password, name, phone },
    );
    return { data: response };
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await apiPost<AuthResponse['data']>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/login`,
      { email, password },
    );
    return { data: response };
  },
};
