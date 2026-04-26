-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id VARCHAR(255),
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#000000',
  is_default BOOLEAN DEFAULT FALSE,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent migrations for existing databases
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_id_name_key;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_name_parent_unique;

CREATE UNIQUE INDEX IF NOT EXISTS categories_user_root_name_unique
  ON categories(user_id, LOWER(name))
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_user_child_name_unique
  ON categories(user_id, parent_id, LOWER(name))
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- Statements table (audit trail)
CREATE TABLE IF NOT EXISTS statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bank_name VARCHAR(50),
  file_name VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'processing'
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  statement_id UUID REFERENCES statements(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description VARCHAR(255),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  ai_suggested_category VARCHAR(100),
  type VARCHAR(10) DEFAULT 'debit',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent migration: ensure transactions.category_id FK uses ON DELETE SET NULL
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

-- Create indices
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_statements_user ON statements(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

-- Insert default categories for new users
-- (These will be created per-user during signup)
