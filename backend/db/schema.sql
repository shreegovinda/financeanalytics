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
