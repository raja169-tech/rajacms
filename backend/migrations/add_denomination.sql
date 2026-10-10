-- Migration: Add denomination JSONB column and verified_by to transactions
-- Run this in your Supabase SQL Editor

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS denomination JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_by  UUID  DEFAULT NULL REFERENCES users(id);

-- Optional index for queries by verified_by
CREATE INDEX IF NOT EXISTS idx_transactions_verified_by ON transactions(verified_by);

COMMENT ON COLUMN transactions.denomination IS 'Note count breakdown e.g. {"note_500": 4, "note_100": 2}. Set by employee via DENO feature.';
COMMENT ON COLUMN transactions.verified_by  IS 'Employee user ID who submitted the denomination.';
