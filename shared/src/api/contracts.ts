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
  CrashReportPayload,
} from "../types/index.js";

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  consentGiven?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSuccessResponse {
  token: string;
  user: User;
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  locale?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  date_format?: string;
  time_format?: string;
  selected_ai_provider?: string;
  selected_ai_model?: string;
  ai_key_mode?: string;
}

export interface UpdatePasswordRequest {
  currentPassword?: string;
  newPassword?: string;
}

export interface CreateCategoryRequest {
  name: string;
  color?: string;
  parent_id?: string | null;
}

export interface UpdateCategoryRequest {
  name: string;
  color: string;
}

export interface UpdateAiPreferencesRequest {
  provider?: string;
  model?: string;
  keyMode?: "admin" | "personal";
}

export interface SaveAiKeyRequest {
  provider: string;
  apiKey: string;
}

export interface UpdateTransactionCategoryRequest {
  category_id: string;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}
