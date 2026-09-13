export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  phone_verified?: boolean;
  whatsapp_opt_in?: boolean;
  needsPhone?: boolean;
  role?: string;
}

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

export interface Transaction {
  id: string;
  date: string;
  amount: number | string;
  description: string;
  type: string;
  category_id?: string;
  ai_suggested_category?: string;
  has_bill?: boolean;
  bank_name?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
  parent_id?: string | null;
}

export interface SummaryStats {
  total_income: number;
  total_expenses: number;
  transaction_count: number;
}

export interface CategoryData {
  name: string;
  value: number;
}

export interface Statement {
  id: string;
  bank_name: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  processing_stage?: string | null;
  processing_progress?: number | null;
  processing_error?: string | null;
  processed_at?: string | null;
  file_available?: boolean;
  statement_month?: string;
  file_format?: string;
}

export interface StatementDraft {
  id: string;
  statement_id: string;
  status: "pending_review" | "confirmed" | "discarded";
  detected_bank: string;
  detected_month: string;
  account_number_hint?: string;
  opening_balance?: number;
  closing_balance?: number;
  total_credits?: number;
  total_debits?: number;
  currency?: string;
  transactions_count: number;
  created_at: string;
  transactions?: Transaction[];
}

export interface Bank {
  id: string;
  name: string;
  active: boolean;
  has_statements: boolean;
  catalogue_id: string | null;
}

export interface BankChoice {
  id: string;
  name: string;
  category: string;
}

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
    keyMode: "admin" | "personal";
  };
}

export interface AuthResponse {
  data: {
    token: string;
    user: {
      id: string;
      email: string;
      name: string;
      phone?: string | null;
      role?: string;
    };
  };
}

export interface CrashReportPayload {
  app_version?: string;
  page_url?: string;
  browser?: string;
  device_class?: string;
  error_summary: string;
  error_details: Record<string, unknown> | string;
}

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
  status: "open" | "investigating" | "resolved";
  created_at: string;
}

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

