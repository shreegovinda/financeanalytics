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

export async function apiPatch<T>(url: string, data: unknown, token?: string): Promise<T> {
  const response = await apiFetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
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
    consentGiven?: boolean,
  ): Promise<AuthResponse> {
    const response = await apiPost<AuthResponse['data']>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/register`,
      { email, password, name, phone, consentGiven },
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

  async sendWhatsAppOtp(
    phone: string,
    purpose: 'whatsapp_login' | 'phone_verify' = 'whatsapp_login',
  ): Promise<{ success: boolean; message: string; phone: string }> {
    return apiPost(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/whatsapp/send-otp`,
      { phone, purpose },
    );
  },

  async verifyWhatsAppOtp(
    phone: string,
    code: string,
    purpose: 'whatsapp_login' | 'phone_verify' = 'whatsapp_login',
  ): Promise<{
    success: boolean;
    token?: string;
    user?: UserProfile;
    message: string;
  }> {
    return apiPost(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/whatsapp/verify-otp`,
      { phone, code, purpose },
    );
  },
};

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  phone_verified?: boolean;
  whatsapp_opt_in?: boolean;
  role?: string;
  locale?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  date_format?: string;
  time_format?: string;
  selected_ai_provider?: string;
  selected_ai_model?: string;
  ai_key_mode?: string;
  needsPhone?: boolean;
  configuredAiKeys?: Array<{
    provider: string;
    keyHint: string;
    updatedAt: string;
  }>;
}

export const userAPI = {
  async getProfile(token: string): Promise<{ user: UserProfile }> {
    return apiGet<{ user: UserProfile }>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/me`,
      token,
    );
  },

  async updateProfile(
    data: Partial<{
      name: string;
      phone: string;
      locale: string;
      timezone: string;
      currency: string;
      language: string;
      date_format: string;
      time_format: string;
      selected_ai_provider: string;
      selected_ai_model: string;
      ai_key_mode: string;
    }>,
    token: string,
  ): Promise<{ user: UserProfile }> {
    return apiPut<{ user: UserProfile }>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/me`,
      data,
      token,
    );
  },
};

export interface AICatalogueModel {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  maxTokens: number;
}

export interface AICatalogueProvider {
  id: string;
  label: string;
  description: string;
  models: AICatalogueModel[];
  envKey: string;
  docsUrl: string;
  userKeyConfigured?: boolean;
  keyHint?: string | null;
  updatedAt?: string | null;
}

export interface AICatalogueResponse {
  catalogue: {
    providers: AICatalogueProvider[];
    defaultProvider: string;
    defaultModel: string;
    disclosures: {
      adminPaidNotice: string;
      personalKeyNotice: string;
      dataTransferNotice: string;
    };
  };
  currentPreferences: {
    provider: string;
    model: string;
    keyMode: 'admin' | 'personal';
  };
}

export const aiAPI = {
  async getCatalogue(token: string): Promise<AICatalogueResponse> {
    return apiGet<AICatalogueResponse>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/catalogue`,
      token,
    );
  },

  async updatePreferences(
    data: { provider?: string; model?: string; keyMode?: 'admin' | 'personal' },
    token: string,
  ): Promise<{ success: boolean; preferences: AICatalogueResponse['currentPreferences'] }> {
    return apiPut(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/preferences`,
      data,
      token,
    );
  },

  async saveKey(
    provider: string,
    apiKey: string,
    token: string,
  ): Promise<{ success: boolean; provider: string; keyHint: string; message: string }> {
    return apiPost(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/keys`,
      { provider, apiKey },
      token,
    );
  },

  async deleteKey(provider: string, token: string): Promise<void> {
    await apiDelete(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/keys/${encodeURIComponent(provider)}`,
      token,
    );
  },
};

export const exportAPI = {
  async downloadJson(token: string): Promise<void> {
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/export/json`;
    const res = await apiFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to download JSON archive');
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `finlytix-export-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  },

  async downloadPdf(token: string): Promise<void> {
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/export/pdf`;
    const res = await apiFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to download PDF summary');
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `finlytix-summary-${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  },
};

export interface CostTransparency {
  currency: string;
  exchange_rate: number;
  is_byok: boolean;
  ai_provider: string;
  ai_model: string;
  usage: {
    statements_processed: number;
    statements_total: number;
    transactions_count: number;
    chat_messages_count: number;
    storage_bytes: number;
    storage_formatted: string;
  };
  costs: {
    ai_parsing_cost: number;
    ai_categorization_cost: number;
    ai_chat_cost: number;
    total_ai_cost: number;
    storage_cost: number;
    compute_cost: number;
    total_infra_cost: number;
    total_platform_cost: number;
    raw_usd?: {
      total_ai_cost: number;
      total_infra_cost: number;
      total_platform_cost: number;
    };
  };
  disclosures: {
    byok_notice: string;
    rates_notice: string;
    transparency_commitment: string;
  };
}

export const accountAPI = {
  async deleteAccount(
    data: { password?: string; confirmPhrase?: string },
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    return apiPost(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/account/delete`,
      data,
      token,
    );
  },

  async getCostTransparency(
    token: string,
  ): Promise<{ success: boolean; transparency: CostTransparency }> {
    return apiGet(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/account/cost-transparency`,
      token,
    );
  },
};

export interface CrashReportPayload {
  app_version?: string;
  page_url?: string;
  browser?: string;
  device_class?: string;
  error_summary: string;
  error_details: Record<string, unknown> | string;
}

export const supportAPI = {
  async submitCrashReport(
    payload: CrashReportPayload,
  ): Promise<{ success: boolean; reportId: string; message: string }> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || undefined : undefined;
    return apiPost<{ success: boolean; reportId: string; message: string }>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/support/crash-report`,
      payload,
      token,
    );
  },
};

export interface AdminMetrics {
  users: {
    total_users: number;
    verified_users: number;
    admin_users: number;
  };
  statements: {
    total_statements: number;
    completed_statements: number;
    failed_statements: number;
    processing_statements: number;
  };
  storage: {
    total_files: number;
    encrypted_files: number;
    plaintext_files: number;
  };
  drafts: {
    total_drafts: number;
    pending_review_drafts: number;
    failed_drafts: number;
  };
  crash_reports: {
    total_crash_reports: number;
    open_crash_reports: number;
    investigating_crash_reports: number;
    resolved_crash_reports: number;
  };
  consent_breakdown: Array<{
    consent_version: string;
    user_count: number;
  }>;
  privacy: {
    total_account_deletions: number;
  };
  ai_mode_distribution: Array<{
    ai_key_mode: string;
    count: number;
  }>;
}

export interface AdminCrashReport {
  id: string;
  user_id: string | null;
  app_version: string;
  page_url: string;
  browser: string;
  device_class: string;
  error_summary: string;
  error_details?: unknown;
  status: 'open' | 'investigating' | 'resolved';
  created_at: string;
}

export const adminAPI = {
  async getMetrics(token: string): Promise<AdminMetrics> {
    return apiGet<AdminMetrics>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/metrics`,
      token,
    );
  },

  async getCrashReports(
    token: string,
    params: { limit?: number; offset?: number; status?: string } = {},
  ): Promise<{ reports: AdminCrashReport[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));
    if (params.status) searchParams.set('status', params.status);
    const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

    return apiGet<{ reports: AdminCrashReport[]; total: number; limit: number; offset: number }>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/crash-reports${queryString}`,
      token,
    );
  },

  async getCrashReportById(id: string, token: string): Promise<{ report: AdminCrashReport }> {
    return apiGet<{ report: AdminCrashReport }>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/crash-reports/${id}`,
      token,
    );
  },

  async updateCrashReportStatus(
    id: string,
    status: 'open' | 'investigating' | 'resolved',
    token: string,
  ): Promise<{ success: boolean; report: AdminCrashReport }> {
    return apiPatch<{ success: boolean; report: AdminCrashReport }>(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/crash-reports/${id}`,
      { status },
      token,
    );
  },
};
