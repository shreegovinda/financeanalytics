import { Platform } from "react-native";
import { getAuthToken, clearAllSession } from "./secureStorage";
import type {
  User,
  UserProfile,
  Transaction,
  Category,
  SummaryStats,
  CategoryData,
  Statement,
  StatementDraft,
  Bank,
  BankChoice,
  AICatalogueResponse,
  CostTransparency,
} from "@finlytix/shared";

// Determine default API host depending on development platform
function getDefaultApiUrl(): string {
  if (Platform.OS === "android") {
    // Android emulator loops back to host machine via 10.0.2.2
    return "http://10.0.2.2:3001";
  }
  // iOS simulator and Web connect directly to localhost
  return "http://localhost:3001";
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || getDefaultApiUrl();

export interface ApiFetchOptions extends RequestInit {
  timeout?: number;
}

export async function apiRequest<T>(
  endpoint: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const token = await getAuthToken();
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await clearAllSession();
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error ||
        errorBody.message ||
        `Request failed with status ${response.status}`,
    );
  }

  return response.json();
}

export const mobileAPI = {
  // Auth
  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: User }> {
    return apiRequest<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async register(
    email: string,
    password: string,
    name: string,
    phone?: string,
    consentGiven?: boolean,
  ): Promise<{ token: string; user: User }> {
    return apiRequest<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, phone, consentGiven }),
    });
  },

  async sendWhatsAppOtp(
    phone: string,
    purpose: "whatsapp_login" | "phone_verify" = "whatsapp_login",
  ): Promise<{ success: boolean; message: string; phone: string }> {
    return apiRequest<{ success: boolean; message: string; phone: string }>(
      "/api/auth/whatsapp/send-otp",
      {
        method: "POST",
        body: JSON.stringify({ phone, purpose }),
      },
    );
  },

  async verifyWhatsAppOtp(
    phone: string,
    code: string,
    purpose: "whatsapp_login" | "phone_verify" = "whatsapp_login",
  ): Promise<{
    success: boolean;
    token?: string;
    user?: User;
    message: string;
  }> {
    return apiRequest<{
      success: boolean;
      token?: string;
      user?: User;
      message: string;
    }>("/api/auth/whatsapp/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code, purpose }),
    });
  },

  async getMe(): Promise<{ user: UserProfile }> {
    return apiRequest<{ user: UserProfile }>("/api/auth/me");
  },

  async updateProfile(
    data: Partial<UserProfile>,
  ): Promise<{ user: UserProfile }> {
    return apiRequest<{ user: UserProfile }>("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async updatePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // Dashboard Stats
  async getSummaryStats(): Promise<SummaryStats> {
    return apiRequest<SummaryStats>("/api/transactions/stats/summary");
  },

  async getCategoryBreakdown(): Promise<CategoryData[]> {
    return apiRequest<CategoryData[]>("/api/analytics/pie");
  },

  // Transactions
  async getTransactions(
    startDate?: string,
    endDate?: string,
  ): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiRequest<{ transactions: Transaction[] }>(
      `/api/transactions${qs}`,
    );
    return res.transactions || [];
  },

  async updateTransactionCategory(
    id: string,
    categoryId: string,
  ): Promise<Transaction> {
    const res = await apiRequest<{ transaction: Transaction }>(
      `/api/transactions/${id}/category`,
      {
        method: "PATCH",
        body: JSON.stringify({ category_id: categoryId }),
      },
    );
    return res.transaction;
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    return apiRequest<Category[]>("/api/categories");
  },

  // Statements
  async getStatements(): Promise<Statement[]> {
    const res = await apiRequest<{ statements: Statement[] }>(
      "/api/upload/statements",
    );
    return res.statements || [];
  },

  async uploadStatement(
    fileUri: string,
    fileName: string,
    fileType: string,
  ): Promise<{ statementId: string }> {
    const token = await getAuthToken();
    const formData = new FormData();

    // In React Native, files in FormData are specified via { uri, name, type }
    formData.append("statement", {
      uri: fileUri,
      name: fileName,
      type: fileType,
    } as unknown as Blob);

    const res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Statement upload failed");
    }

    return res.json();
  },

  async getStatementDraft(
    statementId: string,
  ): Promise<{ draft: StatementDraft }> {
    return apiRequest<{ draft: StatementDraft }>(
      `/api/upload/${statementId}/draft`,
    );
  },

  async confirmStatementDraft(
    statementId: string,
  ): Promise<{ success: boolean; importedCount: number }> {
    return apiRequest<{ success: boolean; importedCount: number }>(
      `/api/upload/${statementId}/confirm`,
      {
        method: "POST",
      },
    );
  },

  async discardStatementDraft(
    statementId: string,
  ): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(
      `/api/upload/${statementId}/discard`,
      {
        method: "POST",
      },
    );
  },

  // Banks
  async getBanks(): Promise<Bank[]> {
    const res = await apiRequest<{ banks: Bank[] }>("/api/banks");
    return res.banks || [];
  },

  async getBankCatalogue(): Promise<BankChoice[]> {
    const res = await apiRequest<{ banks: BankChoice[] }>(
      "/api/banks/catalogue",
    );
    return res.banks || [];
  },

  async addBank(catalogueId: string): Promise<Bank> {
    const res = await apiRequest<{ bank: Bank }>("/api/banks", {
      method: "POST",
      body: JSON.stringify({ catalogue_id: catalogueId }),
    });
    return res.bank;
  },

  async deleteBank(id: string): Promise<void> {
    await apiRequest(`/api/banks/${id}`, { method: "DELETE" });
  },

  // AI
  async getAiCatalogue(): Promise<AICatalogueResponse> {
    return apiRequest<AICatalogueResponse>("/api/ai/catalogue");
  },

  async updateAiPreferences(data: {
    provider?: string;
    model?: string;
    keyMode?: "admin" | "personal";
  }): Promise<void> {
    await apiRequest("/api/ai/preferences", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async saveAiKey(
    provider: string,
    apiKey: string,
  ): Promise<{ success: boolean; keyHint: string }> {
    return apiRequest<{ success: boolean; keyHint: string }>("/api/ai/keys", {
      method: "POST",
      body: JSON.stringify({ provider, apiKey }),
    });
  },

  async deleteAiKey(provider: string): Promise<void> {
    await apiRequest(`/api/ai/keys/${encodeURIComponent(provider)}`, {
      method: "DELETE",
    });
  },

  // Chat Assistant
  async sendChatMessage(
    message: string,
  ): Promise<{ answer: string; toolCalls?: unknown[] }> {
    return apiRequest<{ answer: string; toolCalls?: unknown[] }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },

  // Cost Transparency & Platform Footprint
  async getCostTransparency(): Promise<{
    success: boolean;
    transparency: CostTransparency;
  }> {
    return apiRequest<{ success: boolean; transparency: CostTransparency }>(
      "/api/account/cost-transparency",
    );
  },
};
