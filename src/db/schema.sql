-- ============================================================================
-- Transaction Ledger API - Database Schema
-- Target Database: PostgreSQL 15+ (Compatible with Supabase)
-- ============================================================================

-- Ensure pgcrypto extension is available for UUID generation (Postgres 13+ has gen_random_uuid built-in)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Accounts Table
-- Represents individual financial accounts holding an auditable balance.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_account_balance_non_negative CHECK (balance >= 0)
);

-- ----------------------------------------------------------------------------
-- 2. Transactions Table
-- Immutable ledger recording every credit and debit movement against an account.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    reference_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
);

-- Index for fast query lookups of an account's transaction history sorted by date
CREATE INDEX IF NOT EXISTS idx_transactions_account_id_created_at 
    ON transactions (account_id, created_at DESC);
