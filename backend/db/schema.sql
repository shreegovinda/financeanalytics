-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id VARCHAR(255),
  name VARCHAR(255),
  phone VARCHAR(50),
  token_version INTEGER NOT NULL DEFAULT 0,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, bank_code)
);
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user ON user_bank_accounts(user_id);
ALTER TABLE user_bank_accounts ALTER COLUMN bank_code TYPE VARCHAR(100);
CREATE TABLE IF NOT EXISTS bank_catalogue (
  id TEXT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE user_bank_accounts ADD COLUMN IF NOT EXISTS catalogue_id TEXT REFERENCES bank_catalogue(id);
ALTER TABLE user_bank_accounts ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS user_bank_catalogue_unique ON user_bank_accounts(user_id, catalogue_id);

-- Email verification.
--
-- The ADD COLUMN default is TRUE so that accounts which already existed before
-- verification was introduced are grandfathered in rather than being locked out
-- of their own data. The default is then flipped to FALSE so every new signup
-- must verify. On a fresh database the CREATE TABLE above already sets FALSE and
-- both statements below are no-ops, so this is safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

UPDATE users SET email_verified_at = created_at
  WHERE email_verified IS TRUE AND email_verified_at IS NULL;

-- Magic-link tokens for email verification.
--
-- Only a SHA-256 hash of the token is stored: a leaked database dump must not
-- hand out working verification links. The raw token exists only in the email.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires
  ON email_verification_tokens(expires_at);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#000000',
  is_default BOOLEAN DEFAULT FALSE,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration: add parent_id column if missing (idempotent)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;

-- Migration: replace old unique constraint to allow same name under different parents
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_id_name_key;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_name_parent_unique;

CREATE UNIQUE INDEX IF NOT EXISTS categories_user_root_name_unique
  ON categories(user_id, LOWER(name))
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_user_child_name_unique
  ON categories(user_id, parent_id, LOWER(name))
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- Create statements table (audit trail)
CREATE TABLE IF NOT EXISTS statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'processing',
  processing_stage VARCHAR(50) DEFAULT 'uploaded',
  processing_progress INTEGER DEFAULT 0,
  processing_error TEXT,
  upload_path TEXT,
  ai_provider VARCHAR(50),
  statement_month DATE,
  file_format VARCHAR(10),
  detected_bank_name VARCHAR(100),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE statements ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(50) DEFAULT 'uploaded';
ALTER TABLE statements ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS upload_path TEXT;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS statement_month DATE;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS file_format VARCHAR(10);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS detected_bank_name VARCHAR(100);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
ALTER TABLE statements ALTER COLUMN bank_name TYPE VARCHAR(100);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES user_bank_accounts(id);
INSERT INTO user_bank_accounts (user_id, bank_code)
SELECT DISTINCT user_id, UPPER(TRIM(bank_name)) FROM statements
ON CONFLICT (user_id, bank_code) DO NOTHING;
UPDATE statements s SET bank_account_id = b.id
FROM user_bank_accounts b
WHERE s.bank_account_id IS NULL AND s.user_id = b.user_id
  AND UPPER(TRIM(s.bank_name)) = b.bank_code;
CREATE UNIQUE INDEX IF NOT EXISTS statements_account_month_unique
ON statements(user_id, bank_account_id, statement_month)
WHERE status IN ('processing', 'pending_review', 'completed');

-- Create transactions table
CREATE TABLE IF NOT EXISTS statement_files (
  statement_id UUID PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
  content BYTEA NOT NULL,
  content_type TEXT NOT NULL
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description VARCHAR(255),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  ai_suggested_category VARCHAR(100),
  type VARCHAR(10) DEFAULT 'debit',
  source_index INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_index INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS has_bill BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

-- Staging for statement imports.
--
-- Extraction writes here, not to transactions, so nothing reaches a user's
-- ledger until they have seen it and confirmed. The statements row exists with
-- status 'pending_review' and claims its month, so a second upload of the same
-- month is blocked while a draft is outstanding.
--
-- The payload is JSONB rather than a draft_transactions table because the
-- preview is approve-or-reject as a whole: there are no per-row updates for a
-- table to serve. Totals are denormalised so the preview header does not have to
-- scan the payload.
CREATE TABLE IF NOT EXISTS statement_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL UNIQUE REFERENCES statements(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  total_debit DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_statement_drafts_statement ON statement_drafts(statement_id);

-- Merchant bills attached to a single transaction (Blinkit, Swiggy, Amazon...).
-- Same pending_review -> confirmed lifecycle as a statement import.
CREATE TABLE IF NOT EXISTS transaction_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  merchant_name VARCHAR(255),
  bill_total DECIMAL(12, 2),
  bill_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transaction_bills_transaction ON transaction_bills(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_bills_user_status ON transaction_bills(user_id, status);

-- Line items extracted from a bill.
CREATE TABLE IF NOT EXISTS transaction_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_bill_id UUID NOT NULL REFERENCES transaction_bills(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  quantity DECIMAL(12, 3),
  unit_price DECIMAL(12, 2),
  amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transaction_line_items_bill ON transaction_line_items(transaction_bill_id);
CREATE INDEX IF NOT EXISTS idx_transaction_line_items_transaction ON transaction_line_items(transaction_id);

-- Create OTP codes table
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) DEFAULT 'login',
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) DEFAULT 'login';
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE otp_codes ALTER COLUMN email DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);

-- Create payments table for Razorpay integration
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id VARCHAR(255) UNIQUE NOT NULL,
  razorpay_payment_id VARCHAR(255),
  razorpay_signature VARCHAR(255),
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  description VARCHAR(255),
  feature VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  payment_method VARCHAR(50),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Persistent, user-scoped assistant conversations (financial data is not copied here).
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions(statement_id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_statement_source_index_unique
  ON transactions(statement_id, source_index)
  WHERE source_index IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_statements_user ON statements(user_id);
CREATE INDEX IF NOT EXISTS idx_statements_user_bank_month
  ON statements(user_id, bank_name, statement_month)
  WHERE status IN ('processing', 'completed');
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_expires ON otp_codes(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_purpose_expires ON otp_codes(email, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(razorpay_payment_id);

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sequence BIGSERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sequence ON chat_messages(sequence);
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_history_version INTEGER NOT NULL DEFAULT 0;

-- Versioned consent capture at signup
CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version VARCHAR(20) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  consented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);

-- International foundation (Step 6)
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(20) NOT NULL DEFAULT 'en-IN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE users ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY';
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_format VARCHAR(10) NOT NULL DEFAULT '12h';

ALTER TABLE statements ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE statement_drafts ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR';

-- AI Provider Preferences & Encrypted BYOK Keys (Step 7 & 8)
ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_ai_provider VARCHAR(50) NOT NULL DEFAULT 'gemini';
ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_ai_model VARCHAR(100) NOT NULL DEFAULT 'gemini-2.5-flash';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_key_mode VARCHAR(20) NOT NULL DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS user_ai_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_user_ai_keys_user ON user_ai_keys(user_id);

-- Account Closure Minimal Retention Audit (Step 10)
CREATE TABLE IF NOT EXISTS account_deletion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymized_user_id VARCHAR(64) NOT NULL,
  statement_count INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Roles & Crash Reports (Step 11)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS crash_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  app_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  page_url VARCHAR(255) NOT NULL,
  browser VARCHAR(100),
  device_class VARCHAR(50),
  error_summary VARCHAR(500) NOT NULL,
  error_details JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crash_reports_status ON crash_reports(status);
CREATE INDEX IF NOT EXISTS idx_crash_reports_created ON crash_reports(created_at DESC);

-- Statement Files Application-Level Encryption (Step 12)
ALTER TABLE statement_files ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;

-- WhatsApp Platform Integration (Phase 4)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_session_updated_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(50) NOT NULL,
  last_message_id TEXT,
  current_draft_id UUID REFERENCES statement_drafts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone ON whatsapp_conversations(phone);

-- Sensitive Data Encryption at Rest & Blind Indexing (PLAN-05)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);
ALTER TABLE users ALTER COLUMN name TYPE TEXT;
ALTER TABLE users ALTER COLUMN phone TYPE TEXT;
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);

ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);
ALTER TABLE otp_codes ALTER COLUMN phone TYPE TEXT;
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_hash ON otp_codes(phone_hash);

ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);
ALTER TABLE whatsapp_conversations ALTER COLUMN phone TYPE TEXT;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone_hash ON whatsapp_conversations(phone_hash);

ALTER TABLE transactions ALTER COLUMN description TYPE TEXT;
ALTER TABLE transaction_bills ALTER COLUMN merchant_name TYPE TEXT;
ALTER TABLE transaction_bills ALTER COLUMN file_name TYPE TEXT;
ALTER TABLE transaction_line_items ALTER COLUMN description TYPE TEXT;

-- Activity Logs & Audit Trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'security',
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_action ON activity_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_category ON activity_logs(user_id, category);
-- Per-feature AI choices and encrypted dedicated credentials. Account deletion cascades.
CREATE TABLE IF NOT EXISTS user_ai_use_cases (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  use_case TEXT NOT NULL CHECK (use_case IN ('text_chat', 'voice_chat', 'statement_extraction', 'categorization', 'bill_extraction', 'whatsapp_chat')),
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'anthropic', 'openai', 'groq', 'deepseek', 'mistral')),
  model TEXT NOT NULL,
  key_mode TEXT NOT NULL CHECK (key_mode IN ('admin', 'saved', 'personal')),
  encrypted_key TEXT,
  key_hint TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, use_case),
  CHECK (key_mode <> 'personal' OR encrypted_key IS NOT NULL)
);

ALTER TABLE user_ai_use_cases ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE user_ai_use_cases DROP CONSTRAINT IF EXISTS user_ai_use_cases_provider_check;
ALTER TABLE user_ai_use_cases ADD CONSTRAINT user_ai_use_cases_provider_check
  CHECK (provider IN ('gemini', 'anthropic', 'openai', 'groq', 'deepseek', 'mistral'));
UPDATE user_ai_use_cases settings SET key_mode='personal', encrypted_key=keys.encrypted_key,
  key_hint=keys.key_hint, validated_at=NULL
FROM user_ai_keys keys WHERE settings.key_mode='saved'
  AND keys.user_id=settings.user_id AND keys.provider=settings.provider;

-- Independent assistant conversations; legacy messages remain available as Saved history.
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id)
);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chat_messages_conversation_owner_fk') THEN
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_conversation_owner_fk
      FOREIGN KEY (conversation_id, user_id) REFERENCES chat_conversations(id, user_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON chat_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(user_id, conversation_id, sequence DESC);
