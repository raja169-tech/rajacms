-- =============================================================================
-- Raja CMS — Migration: 002_add_employee_approved_status.sql
-- =============================================================================
-- PURPOSE:
--   Adds the 'employee_approved' intermediate status to the txn_status enum.
--   This enables a two-step approval workflow:
--
--       Client submits      → status: 'pending'
--       Employee verifies   → status: 'employee_approved'  (client still sees "Pending")
--       Admin final-approves→ status: 'approved'
--       Admin rejects       → status: 'rejected'
--
-- HOW TO RUN:
--   1. First run 001_initial_schema.sql on a fresh database.
--   2. Then run this file in Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--   3. Click "Run".
--
-- SAFE TO RE-RUN:
--   All statements below use IF NOT EXISTS or IF EXISTS guards,
--   so running this file multiple times will NOT cause errors.
-- =============================================================================


-- ─── STEP 1: Extend the txn_status enum ─────────────────────────────────────
-- Adds 'employee_approved' if it doesn't already exist.
-- This is the ONLY schema change required for the two-step approval flow.
-- PostgreSQL enum values cannot be removed once added, but adding is safe.

ALTER TYPE txn_status ADD VALUE IF NOT EXISTS 'employee_approved';


-- ─── STEP 2: Update the stale-pending index to cover employee_approved ───────
-- The original index in 001 only covered status = 'pending'.
-- We drop and recreate it to also include 'employee_approved'
-- so stale-transaction checks remain fast.

DROP INDEX IF EXISTS idx_txn_pending_age;

CREATE INDEX IF NOT EXISTS idx_txn_pending_age
    ON transactions(created_at)
    WHERE status IN ('pending', 'employee_approved');


-- ─── STEP 3: Verification query (optional, informational) ────────────────────
-- Run this to confirm the enum now includes 'employee_approved':
--
--   SELECT unnest(enum_range(NULL::txn_status)) AS txn_status_values;
--
-- Expected output:
--   pending
--   approved
--   rejected
--   employee_approved
-- =============================================================================
